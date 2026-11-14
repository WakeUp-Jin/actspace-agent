import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export type FixtureError = { readonly label: string; readonly code: number };

const directive = /\/\/ @ts-expect-error \[/gu;

/**
 * 类型样例只给类型检查看，不执行。样例里每处误用的上一行写 `// @ts-expect-error [标签]`，这里用 TypeScript 编译它两遍：
 * 原样编译必须没有任何报错（每个 `@ts-expect-error` 都压住了一个真实的错误）；
 * 去掉 `@ts-expect-error` 再编译，得到每处误用的错误码，由 spec 核对是不是预期的那个原因。
 */
export function typeFixture(fixturePath: string) {
  const fixture = readFileSync(fixturePath, "utf8");

  /** 用和各包相同的严格选项编译样例，返回样例文件里的报错：错误码和它上一行注释里的标签。 */
  function diagnose(source: string): readonly FixtureError[] {
    const options: ts.CompilerOptions = {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      lib: ["lib.es2022.d.ts"],
      types: ["node"],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersionOrOptions, ...rest) => resolve(fileName) === fixturePath
      ? ts.createSourceFile(fileName, source, languageVersionOrOptions, true)
      : getSourceFile(fileName, languageVersionOrOptions, ...rest);
    const program = ts.createProgram([fixturePath], options, host);
    const file = program.getSourceFile(fixturePath);
    if (file === undefined) throw new Error("fixture was not loaded");
    const lines = source.split("\n");
    return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map((diagnostic) => {
      const line = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
      const label = /\[([a-z-]+)\]/u.exec(lines[line - 1] ?? "")?.[1];
      return { label: label ?? `line ${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`, code: diagnostic.code };
    });
  }

  return {
    /** 样例里写了几处 `@ts-expect-error [标签]`。 */
    expectedErrors: fixture.match(directive)?.length ?? 0,
    /** 原样编译的报错，应当是空的。 */
    asWritten: (): readonly FixtureError[] => diagnose(fixture),
    /** 去掉 `@ts-expect-error` 之后的报错。 */
    withoutDirectives: (): readonly FixtureError[] => diagnose(fixture.replace(directive, "// [")),
  };
}
