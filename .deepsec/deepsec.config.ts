import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "sdk-react-native", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
