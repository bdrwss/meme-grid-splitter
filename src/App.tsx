import { Toaster } from "@/components/ui/sonner";
import { SplitterPage } from "@/pages/SplitterPage";

export default function App() {
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <SplitterPage />
        </main>
      </div>
      <Toaster />
    </>
  );
}