import { useEffect } from "react";
import { useVault } from "./state/vault";
import { VaultPicker } from "./components/VaultPicker";
import { Shell } from "./components/Shell";

export default function App() {
  const { root, restoring, init } = useVault();

  useEffect(() => {
    void init();
  }, [init]);

  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Opening vault…
      </div>
    );
  }

  return root ? <Shell /> : <VaultPicker />;
}
