import { OpenTimestampsClient } from "@otskit/client";

const TEST_HASH =
	"02aba12d035707b5380044eb9a62965dd548c47febe89ac0b453e29893617da3";

async function main() {
	const client = new OpenTimestampsClient({
		minimumSuccessfulSubmissions: 1,
	});

	console.log("Submitting NWANA SHA-256 to OpenTimestamps...");

	const proof = await client.stamp(TEST_HASH);

	console.log("STAMP OK");
	console.log("Proof bytes:", proof.length);
	console.log("Proof base64:", proof.toString("base64"));
}

main().catch((error) => {
	console.error("STAMP FAILED");
	console.error(error);
	process.exit(1);
});