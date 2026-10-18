import { useEffect } from "react";
import { useToast } from "../ui/Toast";
import { registerServiceWorker } from "./register";

export function UpdateToast() {
  const toast = useToast();
  useEffect(() => {
    registerServiceWorker(activate => toast.show("有新版本", { sticky: true, action: { label: "刷新", run: activate } }));
  }, [toast]);
  return null;
}
