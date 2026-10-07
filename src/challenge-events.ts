// NWANA Charity Challenge Series — canonical event definitions (race 216323).
//
// NEUTRAL MODULE: this file must not import from ./challenge or
// ./challenge-personal-best (circular-dependency guard). Both modules import
// the event table from here. Production truth — mirrors RunSignup race 216323
// (kilometers; Running/Walking 1K @1000 m; Running 4×1K Relay @1000 m).

export const CHALLENGE_RACE_ID = 216323;

export interface ChallengeEventDef {
	event_id: number;
	event_name: string;
	discipline: "Nordic Walking" | "Race Walking" | "Running" | "Cycling" | "Walking" | "Open Challenge";
	format: "mileage" | "speed" | "relay" | "team" | "open";
	distance_label: string;
	fixed_distance_m: number | null;
}

// Production truth — mirrors RUNSIGNUP_FACTUAL_MAP.md (race 216323).
export const CHALLENGE_EVENTS: ChallengeEventDef[] = [
	// Nordic Walking (7)
	{ event_id: 1222833, event_name: "Nordic Walking — Weekly Mileage", discipline: "Nordic Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222834, event_name: "Nordic Walking — 1K", discipline: "Nordic Walking", format: "speed", distance_label: "1K", fixed_distance_m: 1000 },
	{ event_id: 1222835, event_name: "Nordic Walking — 3K", discipline: "Nordic Walking", format: "speed", distance_label: "3K", fixed_distance_m: 3000 },
	{ event_id: 1222836, event_name: "Nordic Walking — 5K", discipline: "Nordic Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222837, event_name: "Nordic Walking — 10K", discipline: "Nordic Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222838, event_name: "Nordic Walking — 4×1K Relay", discipline: "Nordic Walking", format: "relay", distance_label: "4×1K Relay", fixed_distance_m: 1000 },
	{ event_id: 1222839, event_name: "Nordic Walking — 4×5K Relay", discipline: "Nordic Walking", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Race Walking (6)
	{ event_id: 1222840, event_name: "Race Walking — Weekly Mileage", discipline: "Race Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222841, event_name: "Race Walking — 3K", discipline: "Race Walking", format: "speed", distance_label: "3K", fixed_distance_m: 3000 },
	{ event_id: 1222842, event_name: "Race Walking — 5K", discipline: "Race Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222843, event_name: "Race Walking — 10K", discipline: "Race Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222844, event_name: "Race Walking — 20K", discipline: "Race Walking", format: "speed", distance_label: "20K", fixed_distance_m: 20000 },
	{ event_id: 1222845, event_name: "Race Walking — 4×5K Relay", discipline: "Race Walking", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Running (7)
	{ event_id: 1222846, event_name: "Running — Weekly Mileage", discipline: "Running", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222847, event_name: "Running — 1K", discipline: "Running", format: "speed", distance_label: "1K", fixed_distance_m: 1000 },
	{ event_id: 1222848, event_name: "Running — 5K", discipline: "Running", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222849, event_name: "Running — 10K", discipline: "Running", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222850, event_name: "Running — Half Marathon", discipline: "Running", format: "speed", distance_label: "Half Marathon", fixed_distance_m: 21097 },
	{ event_id: 1222851, event_name: "Running — 4×1K Relay", discipline: "Running", format: "relay", distance_label: "4×1K Relay", fixed_distance_m: 1000 },
	{ event_id: 1222852, event_name: "Running — 4×5K Relay", discipline: "Running", format: "relay", distance_label: "4×5K Relay", fixed_distance_m: 5000 },
	// Cycling (6)
	{ event_id: 1222853, event_name: "Cycling — Weekly Mileage", discipline: "Cycling", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222854, event_name: "Cycling — 10K", discipline: "Cycling", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	{ event_id: 1222855, event_name: "Cycling — 20K", discipline: "Cycling", format: "speed", distance_label: "20K", fixed_distance_m: 20000 },
	{ event_id: 1222856, event_name: "Cycling — 40K", discipline: "Cycling", format: "speed", distance_label: "40K", fixed_distance_m: 40000 },
	{ event_id: 1222857, event_name: "Cycling — 100K", discipline: "Cycling", format: "speed", distance_label: "100K", fixed_distance_m: 100000 },
	{ event_id: 1222858, event_name: "Cycling — Team 100K", discipline: "Cycling", format: "team", distance_label: "Team 100K", fixed_distance_m: null },
	// Walking (4)
	{ event_id: 1222897, event_name: "Walking — Weekly Mileage", discipline: "Walking", format: "mileage", distance_label: "Weekly Mileage", fixed_distance_m: null },
	{ event_id: 1222898, event_name: "Walking — 1K", discipline: "Walking", format: "speed", distance_label: "1K", fixed_distance_m: 1000 },
	{ event_id: 1222899, event_name: "Walking — 5K", discipline: "Walking", format: "speed", distance_label: "5K", fixed_distance_m: 5000 },
	{ event_id: 1222900, event_name: "Walking — 10K", discipline: "Walking", format: "speed", distance_label: "10K", fixed_distance_m: 10000 },
	// Open Challenge (1) — participation + fundraising, not a competitive discipline.
	// Activity type is selected at logging time and stored in D1 for personal history.
	{ event_id: 1222924, event_name: "Open Challenge — Move for NWANA", discipline: "Open Challenge", format: "open", distance_label: "Any Activity", fixed_distance_m: null },
];

export const CHALLENGE_EVENT_IDS = CHALLENGE_EVENTS.map((e) => e.event_id);

// Super Event bundles → their sub-event IDs (production truth, race 216323).
export const BUNDLE_TO_EVENTS: Record<number, number[]> = {
	1222859: [1222833, 1222834, 1222835, 1222836, 1222837, 1222838, 1222839], // NW All Events
	1222860: [1222840, 1222841, 1222842, 1222843, 1222844, 1222845], // RW All Events
	1222861: [1222846, 1222847, 1222848, 1222849, 1222850, 1222851, 1222852], // Running All Events
	1222862: [1222853, 1222854, 1222855, 1222856, 1222857, 1222858], // Cycling All Events
	1222905: [1222897, 1222898, 1222899, 1222900], // Walking All Events
};
export const BUNDLE_EVENT_IDS = Object.keys(BUNDLE_TO_EVENTS).map(Number);
