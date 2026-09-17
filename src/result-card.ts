export type ResultCardVariant =
	| "STAGE_LEADERS"
	| "LEVEL_WINNERS"
	| "RESULTS_SPOTLIGHT";

export interface ResultCardWinner {
	athlete: string;
	gender: string;
	time: string | null;
	performance_level: string | null;
}

export interface ResultCardInput {
	publicationKey: string;
	title: string;
	distance: string;
	winners: ResultCardWinner[];
}

const NWANA_LOGO_URL =
	"https://d368g9lw5ileu7.cloudfront.net/uploads/generic/genericImage-websiteLogo-281959-1788823407.1047-0.bQN0DV.jpg";

const VARIANTS: readonly ResultCardVariant[] = [
	"STAGE_LEADERS",
	"LEVEL_WINNERS",
	"RESULTS_SPOTLIGHT",
];

function stableNumber(value: string): number {
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function selectResultCardVariant(
	publicationKey: string,
): ResultCardVariant {
	return VARIANTS[stableNumber(publicationKey) % VARIANTS.length];
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function compactLevel(value: string | null): string {
	return (value ?? "Open").replace(/\s*\([^)]*\)\s*$/, "");
}

function titleLines(title: string): string[] {
	const clean = title.replace(/\s*[—-]\s*Official Results\s*$/i, "");
	const words = clean.split(/\s+/);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (next.length > 34 && line) {
			lines.push(line);
			line = word;
		} else {
			line = next;
		}
	}
	if (line) lines.push(line);
	return lines.slice(0, 3);
}

function winnerRows(winners: ResultCardWinner[]): string {
	return winners.slice(0, 7).map((winner, index) => {
		const y = 500 + index * 68;
		const label = `${compactLevel(winner.performance_level)} · ${winner.gender}`;
		const result = winner.time
			? `${winner.athlete} · ${winner.time}`
			: winner.athlete;
		return `
			<text x="90" y="${y}" class="level">${escapeXml(label)}</text>
			<text x="90" y="${y + 34}" class="winner">${escapeXml(result)}</text>
		`;
	}).join("");
}

export function buildResultCardSvg(input: ResultCardInput): string {
	const variant = selectResultCardVariant(input.publicationKey);
	const palette = {
		STAGE_LEADERS: {
			background: "#071b33",
			accent: "#ed1c24",
			secondary: "#18a6a6",
			eyebrow: "STAGE LEADERS",
		},
		LEVEL_WINNERS: {
			background: "#10263f",
			accent: "#18a6a6",
			secondary: "#ed1c24",
			eyebrow: "PERFORMANCE LEVEL WINNERS",
		},
		RESULTS_SPOTLIGHT: {
			background: "#14223a",
			accent: "#ed1c24",
			secondary: "#f4b942",
			eyebrow: "RESULTS SPOTLIGHT",
		},
	}[variant];
	const lines = titleLines(input.title);
	const title = lines.map((line, index) =>
		`<text x="90" y="${255 + index * 64}" class="title">${escapeXml(line)}</text>`
	).join("");
	const empty = input.winners.length === 0
		? '<text x="90" y="535" class="winner">Official results are ready</text>'
		: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
		<rect width="1080" height="1080" fill="${palette.background}"/>
		<path d="M0 0H1080V34H0Z" fill="${palette.accent}"/>
		<path d="M780 0H1080V1080H955Z" fill="${palette.secondary}" opacity=".18"/>
		<circle cx="950" cy="145" r="190" fill="${palette.accent}" opacity=".12"/>
		<image href="${NWANA_LOGO_URL}" x="90" y="65" width="290" height="110" preserveAspectRatio="xMinYMid meet"/>
		<text x="90" y="215" class="eyebrow">${palette.eyebrow}</text>
		${title}
		<rect x="90" y="425" width="155" height="6" rx="3" fill="${palette.accent}"/>
		${winnerRows(input.winners)}
		${empty}
		<text x="90" y="1010" class="footer">2026 NWANA OPEN ${escapeXml(input.distance)} NORDIC WALKING SERIES</text>
		<style>
			text { font-family: Arial, Helvetica, sans-serif; fill: #fff; }
			.eyebrow { font-size: 28px; font-weight: 700; letter-spacing: 4px; }
			.title { font-size: 52px; font-weight: 800; }
			.level { font-size: 20px; font-weight: 700; letter-spacing: 1px; fill: #8fd7d7; }
			.winner { font-size: 28px; font-weight: 700; }
			.footer { font-size: 20px; font-weight: 700; letter-spacing: 2px; fill: #cbd5e1; }
		</style>
	</svg>`;
}
