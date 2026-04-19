"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/persistent-storage";

export function PersistentStorageRequest() {
  useEffect(() => {
    requestPersistentStorage();
  }, []);
  return null;
}
