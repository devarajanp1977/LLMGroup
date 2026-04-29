import { bootstrapStorage } from "@/lib/store";

async function main() {
  const status = await bootstrapStorage();
  console.log(`Atrium storage ready (${status.mode})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
