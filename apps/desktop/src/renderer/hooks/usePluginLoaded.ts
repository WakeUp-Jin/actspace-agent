import { useEffect, useState } from "react";
import { pluginsApi } from "../api/plugins";

/**
 * Whether a plugin was loaded at this launch (`plugins.list` → `loaded`). `undefined` while the list is
 * loading; a failed request counts as not loaded, so dependent UI stays hidden rather than half-working.
 */
export function usePluginLoaded(id: string): boolean | undefined {
  const [loaded, setLoaded] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let canceled = false;
    void pluginsApi
      .list()
      .then((items) => {
        if (!canceled) setLoaded(items.find((item) => item.id === id)?.loaded === true);
      })
      .catch(() => {
        if (!canceled) setLoaded(false);
      });
    return () => {
      canceled = true;
    };
  }, [id]);
  return loaded;
}
