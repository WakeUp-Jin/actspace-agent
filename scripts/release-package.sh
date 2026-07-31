#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"
desktop_dir="${repo_root}/packages/desktop"
desktop_pkg="${desktop_dir}/package.json"
desktop_resources_dir="${desktop_dir}/resources"
artifact_root="${dist_dir}/desktop"
deploy_dir="${dist_dir}/desktop-app"
electron_runtime_dir="${desktop_dir}/node_modules/electron/dist"
mac_codesign_identity="${ACTSPACE_MAC_CODESIGN_IDENTITY:-}"
mac_notarize="${ACTSPACE_MAC_NOTARIZE:-false}"
mac_ad_hoc_sign="${ACTSPACE_MAC_ADHOC_SIGN:-false}"
signed=false
notarized=false
signature="none"
packaging="portable-electron-archive"
native_pty_node=""
native_spawn_helper=""

is_truthy() {
  case "$(printf "%s" "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

collect_node_pty_artifacts() {
  local app_root="$1"
  local node_pty_root="${app_root}/node_modules/node-pty"
  local prebuild_platform="${platform}"
  if [[ "${platform}" == "darwin" ]]; then
    prebuild_platform="darwin"
  fi
  local native_root="${node_pty_root}/prebuilds/${prebuild_platform}-${artifact_arch}"
  if [[ ! -d "${node_pty_root}" ]]; then
    echo "node-pty is missing from packaged application: ${node_pty_root}" >&2
    exit 1
  fi
  native_pty_node="${native_root}/pty.node"
  native_spawn_helper="${native_root}/spawn-helper"
  if [[ -z "${native_pty_node}" || -z "${native_spawn_helper}" ]]; then
    echo "node-pty native artifacts are incomplete under ${node_pty_root}" >&2
    exit 1
  fi
  if [[ ! -f "${native_pty_node}" || ! -f "${native_spawn_helper}" ]]; then
    echo "node-pty native artifacts are missing for ${prebuild_platform}-${artifact_arch}: ${native_root}" >&2
    exit 1
  fi
  chmod 755 "${native_pty_node}" "${native_spawn_helper}"

  local pty_file_info
  local helper_file_info
  pty_file_info="$(file "${native_pty_node}")"
  helper_file_info="$(file "${native_spawn_helper}")"
  local expected_arch_pattern="${artifact_arch}"
  if [[ "${artifact_arch}" == "x64" ]]; then
    expected_arch_pattern="x86_64"
  fi
  if [[ "${pty_file_info}" != *"${expected_arch_pattern}"* || "${helper_file_info}" != *"${expected_arch_pattern}"* ]]; then
    echo "node-pty architecture mismatch; expected ${artifact_arch}" >&2
    echo "${pty_file_info}" >&2
    echo "${helper_file_info}" >&2
    exit 1
  fi
  if [[ ! -x "${native_spawn_helper}" ]]; then
    echo "node-pty spawn-helper is not executable: ${native_spawn_helper}" >&2
    exit 1
  fi
}

platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "${arch}" in
  arm64 | aarch64)
    artifact_arch="arm64"
    ;;
  x86_64 | amd64)
    artifact_arch="x64"
    ;;
  *)
    artifact_arch="${arch}"
    ;;
esac

artifact_name="actspace-desktop-${platform}-${artifact_arch}.tar.gz"
artifact_path="${dist_dir}/${artifact_name}"
dmg_name=""
dmg_path=""
dmg_manifest_value=null
dmg_size_bytes=null
app_name="$(node -e "const pkg=require(process.argv[1]); console.log(pkg.productName || pkg.name || 'actspace-desktop')" "${desktop_pkg}")"
app_version="$(node -e "const pkg=require(process.argv[1]); console.log(pkg.version || '0.0.0')" "${desktop_pkg}")"
app_bundle_name="${app_name}.app"
app_executable_name="$(printf "%s" "${app_name}" | tr -cd '[:alnum:]_-')"
if [[ -z "${app_executable_name}" ]]; then
  app_executable_name="actspace"
fi
generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
git_sha="${GITHUB_SHA:-$(git -C "${repo_root}" rev-parse HEAD 2>/dev/null || echo unknown)}"

rm -rf "${dist_dir}"
mkdir -p "${artifact_root}"

pnpm --filter @actspace/desktop native:prepare
pnpm --filter @actspace/desktop build
if ! pnpm --filter @actspace/desktop --prod deploy --legacy --offline "${deploy_dir}"; then
  echo "Offline deploy failed; retrying with registry access so local packaging can hydrate the pnpm store." >&2
  rm -rf "${deploy_dir}"
  pnpm --filter @actspace/desktop --prod deploy --legacy "${deploy_dir}"
fi

find "${deploy_dir}" -type d -name test -prune -exec rm -rf {} +
find "${deploy_dir}" \( -name "*.map" -o -name "*.d.ts" -o -name "*.d.mts" \) -type f -delete
collect_node_pty_artifacts "${deploy_dir}"

if [[ ! -d "${electron_runtime_dir}" ]]; then
  echo "Electron runtime not found at ${electron_runtime_dir}" >&2
  echo "Run pnpm install before packaging release assets." >&2
  exit 1
fi

case "${platform}" in
  darwin)
    runtime_app="${electron_runtime_dir}/Electron.app"
    packaged_app="${artifact_root}/${app_bundle_name}"
    if [[ ! -d "${runtime_app}" ]]; then
      echo "Electron.app not found at ${runtime_app}" >&2
      exit 1
    fi
    cp -R "${runtime_app}" "${packaged_app}"
    runtime_executable="${packaged_app}/Contents/MacOS/Electron"
    app_executable="${packaged_app}/Contents/MacOS/${app_executable_name}"
    if [[ "${app_executable_name}" != "Electron" && -f "${runtime_executable}" ]]; then
      mv "${runtime_executable}" "${app_executable}"
    fi
    mkdir -p "${packaged_app}/Contents/Resources"
    rm -rf "${packaged_app}/Contents/Resources/app"
    cp -R "${deploy_dir}" "${packaged_app}/Contents/Resources/app"
    collect_node_pty_artifacts "${packaged_app}/Contents/Resources/app"
    if [[ -f "${desktop_resources_dir}/icon.icns" ]]; then
      cp "${desktop_resources_dir}/icon.icns" "${packaged_app}/Contents/Resources/icon.icns"
    fi
    if command -v /usr/libexec/PlistBuddy >/dev/null 2>&1; then
      /usr/libexec/PlistBuddy -c "Set :CFBundleName ${app_name}" "${packaged_app}/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${app_name}" "${packaged_app}/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.actspace.desktop" "${packaged_app}/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${app_executable_name}" "${packaged_app}/Contents/Info.plist" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string ${app_executable_name}" "${packaged_app}/Contents/Info.plist" 2>/dev/null \
        || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${app_version}" "${packaged_app}/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${app_version}" "${packaged_app}/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile icon.icns" "${packaged_app}/Contents/Info.plist" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string icon.icns" "${packaged_app}/Contents/Info.plist" 2>/dev/null \
        || true
    fi
    if [[ -n "${mac_codesign_identity}" ]]; then
      codesign --force --options runtime --timestamp --sign "${mac_codesign_identity}" "${native_pty_node}"
      codesign --force --options runtime --timestamp --sign "${mac_codesign_identity}" "${native_spawn_helper}"
      codesign --verify --strict --verbose=2 "${native_pty_node}"
      codesign --verify --strict --verbose=2 "${native_spawn_helper}"
      codesign --force --deep --options runtime --timestamp --sign "${mac_codesign_identity}" "${packaged_app}"
      codesign --verify --deep --strict --verbose=2 "${packaged_app}"
      signed=true
      signature="developer-id"
    elif is_truthy "${mac_ad_hoc_sign}"; then
      codesign --force --sign - --timestamp=none "${native_pty_node}"
      codesign --force --sign - --timestamp=none "${native_spawn_helper}"
      codesign --verify --strict --verbose=2 "${native_pty_node}"
      codesign --verify --strict --verbose=2 "${native_spawn_helper}"
      codesign --force --sign - --timestamp=none "${app_executable}"
      codesign --force --sign - --timestamp=none "${packaged_app}"
      codesign --verify --no-strict --verbose=2 "${packaged_app}"
      signature="ad-hoc"
    else
      codesign --remove-signature "${packaged_app}" 2>/dev/null || true
    fi
    if is_truthy "${mac_notarize}"; then
      if [[ "${signed}" != "true" ]]; then
        echo "ACTSPACE_MAC_NOTARIZE=true requires ACTSPACE_MAC_CODESIGN_IDENTITY." >&2
        exit 1
      fi
      require_env APPLE_ID
      require_env APPLE_APP_SPECIFIC_PASSWORD
      require_env APPLE_TEAM_ID
      notary_archive="${dist_dir}/actspace-notary.zip"
      ditto -c -k --keepParent "${packaged_app}" "${notary_archive}"
      xcrun notarytool submit "${notary_archive}" \
        --apple-id "${APPLE_ID}" \
        --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
        --team-id "${APPLE_TEAM_ID}" \
        --wait
      xcrun stapler staple "${packaged_app}"
      xcrun stapler validate "${packaged_app}"
      rm -f "${notary_archive}"
      notarized=true
    fi
    dmg_name="actspace-desktop-${platform}-${artifact_arch}.dmg"
    dmg_path="${dist_dir}/${dmg_name}"
    dmg_root="${dist_dir}/dmg-root"
    mkdir -p "${dmg_root}"
    cp -R "${packaged_app}" "${dmg_root}/${app_bundle_name}"
    ln -s /Applications "${dmg_root}/Applications"
    hdiutil create -volname "${app_name}" -srcfolder "${dmg_root}" -ov -format UDZO "${dmg_path}"
    rm -rf "${dmg_root}"
    dmg_manifest_value="\"${dmg_name}\""
    dmg_size_bytes="$(wc -c < "${dmg_path}" | tr -d '[:space:]')"
    packaging="portable-electron-archive-and-macos-dmg"
    ;;
  linux)
    cp -R "${electron_runtime_dir}/." "${artifact_root}/"
    mv "${artifact_root}/electron" "${artifact_root}/actspace" 2>/dev/null || true
    mkdir -p "${artifact_root}/resources"
    cp -R "${deploy_dir}" "${artifact_root}/resources/app"
    collect_node_pty_artifacts "${artifact_root}/resources/app"
    ;;
  *)
    echo "Unsupported release packaging platform: ${platform}" >&2
    exit 1
    ;;
esac

tar -czf "${artifact_path}" -C "${artifact_root}" .

artifact_size_bytes="$(wc -c < "${artifact_path}" | tr -d '[:space:]')"
cat > "${dist_dir}/release-manifest.json" <<EOF
{
  "repository": "${GITHUB_REPOSITORY:-local}",
  "git_sha": "${git_sha}",
  "generated_at_utc": "${generated_at}",
  "application": "${app_name}",
  "version": "${app_version}",
  "platform": "${platform}",
  "arch": "${artifact_arch}",
  "artifact": "${artifact_name}",
  "artifact_size_bytes": ${artifact_size_bytes},
  "dmg_artifact": ${dmg_manifest_value},
  "dmg_artifact_size_bytes": ${dmg_size_bytes},
  "signed": ${signed},
  "notarized": ${notarized},
  "signature": "${signature}",
  "packaging": "${packaging}"
}
EOF

echo "${artifact_path}"
