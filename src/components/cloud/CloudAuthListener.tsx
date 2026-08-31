import { useEffect } from "react";
import { startCloudAuthListener } from "../../services/supabase";

export function CloudAuthListener() {
  useEffect(() => startCloudAuthListener(), []);
  return null;
}
