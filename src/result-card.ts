import { RESULT_BACKGROUND_01_JPEG_BASE64 } from "./assets/result-background-01";
import { getSeries2026LevelDefinitions } from "./series-2026-results";

export interface ResultCardWinner {
	athlete: string;
	gender: string;
	time: string | null;
	performance_level: string | null;
	series_record?: boolean;
}

export interface ResultCardLevel {
	name: string;
	threshold: string;
	winners: ResultCardWinner[];
}

export interface ResultCardInput {
	publicationKey: string;
	title: string;
	distance: string;
	winners: ResultCardWinner[];
	levels?: ResultCardLevel[];
	logoUrl?: string;
}

const NWANA_LOGO_URL =
	"https://d368g9lw5ileu7.cloudfront.net/uploads/generic/genericImage-websiteLogo-281959-1788823407.1047-0.bQN0DV.jpg";

export const RESULT_CARD_DESIGN_BLOCKER =
	"Approved NWANA result-card background is not installed";

export const RESULT_CARD_PUBLICATION_BLOCKER =
	"Owner approval of the completed result card is required";

export function isResultCardDesignReady(): boolean {
	return RESULT_BACKGROUND_01_JPEG_BASE64.length > 0;
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function compact(value: string, maximum: number): string {
	return value.length <= maximum
		? value
		: `${value.slice(0, Math.max(0, maximum - 1)).trim()}…`;
}

function eventDate(title: string): string {
	return title.match(
		/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/,
	)?.[0] ?? "OFFICIAL RESULTS";
}

function genderLabel(value: string): string {
	switch (value.toUpperCase()) {
		case "M":
		case "MEN": return "MEN";
		case "F":
		case "WOMEN": return "WOMEN";
		default: return value.toUpperCase();
	}
}

function possessiveGender(value: string): string {
	const gender = genderLabel(value);
	return gender === "MEN"
		? "MEN'S"
		: gender === "WOMEN"
			? "WOMEN'S"
			: gender;
}

function levelRows(levels: ResultCardLevel[]): string {
	return levels.slice(0, 5).map((level, index) => {
		const y = 625 + index * 82;
		const result = level.winners.length > 0
			? level.winners.slice(0, 2).map((winner) =>
				`${genderLabel(winner.gender)} · ${winner.athlete}${winner.time ? ` · ${winner.time}` : ""}`
			).join("   |   ")
			: "NO RESULT THIS STAGE";
		return `
			<text x="70" y="${y}" class="level-name">${escapeXml(level.name.toUpperCase())}</text>
			<text x="400" y="${y}" class="level-threshold">${escapeXml(level.threshold)}</text>
			<text x="70" y="${y + 31}" class="${level.winners.length > 0 ? "level-result" : "level-empty"}">${escapeXml(compact(result, 62))}</text>
		`;
	}).join("");
}

export function buildResultCardSvg(input: ResultCardInput): string {
	if (!isResultCardDesignReady()) {
		throw new Error(RESULT_CARD_DESIGN_BLOCKER);
	}
	const primary =
		input.winners.find((winner) => winner.series_record) ??
		input.winners[0] ??
		null;
	const recordLabel = primary?.series_record
		? `${possessiveGender(primary.gender)} SERIES RECORD`
		: primary
			? `${genderLabel(primary.gender)} · ${(primary.performance_level ?? "OPEN").replace(/\s*\([^)]*\)\s*$/, "").toUpperCase()}`
			: "OFFICIAL RESULTS";
	const athlete = primary?.athlete ?? "OFFICIAL RESULTS";
	const time = primary?.time ?? "";
	const logo = input.logoUrl ?? NWANA_LOGO_URL;
	const levels = input.levels ?? getSeries2026LevelDefinitions(input.distance).map(
		(level) => ({
			...level,
			winners: input.winners.filter((winner) =>
				winner.performance_level?.startsWith(level.name)
			),
		}),
	);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
		<defs>
			<linearGradient id="readability" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="#061b34" stop-opacity=".97"/>
				<stop offset=".54" stop-color="#061b34" stop-opacity=".78"/>
				<stop offset=".76" stop-color="#061b34" stop-opacity=".22"/>
				<stop offset="1" stop-color="#061b34" stop-opacity="0"/>
			</linearGradient>
			<linearGradient id="lower-readability" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#061b34" stop-opacity=".10"/>
				<stop offset=".35" stop-color="#061b34" stop-opacity=".78"/>
				<stop offset="1" stop-color="#061b34" stop-opacity=".94"/>
			</linearGradient>
		</defs>
		<image href="data:image/jpeg;base64,${RESULT_BACKGROUND_01_JPEG_BASE64}" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
		<rect width="820" height="1080" fill="url(#readability)"/>
		<rect y="485" width="1080" height="595" fill="url(#lower-readability)"/>
		<image href="${escapeXml(logo)}" x="70" y="52" width="122" height="122" preserveAspectRatio="xMidYMid meet"/>
		<text x="220" y="88" class="series">2026 NWANA OPEN ${escapeXml(input.distance)} SERIES</text>
		<text x="220" y="128" class="date">${escapeXml(eventDate(input.title).toUpperCase())}</text>
		<rect x="70" y="205" width="12" height="78" rx="6" fill="#ed1c24"/>
		<text x="106" y="232" class="record">${escapeXml(recordLabel)}</text>
		<text x="106" y="293" class="athlete">${escapeXml(compact(athlete.toUpperCase(), 25))}</text>
		<text x="103" y="411" class="time">${escapeXml(time)}</text>
		<text x="70" y="541" class="ladder-title">PERFORMANCE LEVELS · ${escapeXml(input.distance)}</text>
		${levelRows(levels)}
		<text x="70" y="1040" class="footer">OFFICIAL NWANA SERIES RESULTS</text>
		<style>
			text { font-family: Arial, Helvetica, sans-serif; fill: #fff; }
			.series { font-size: 23px; font-weight: 800; letter-spacing: 2px; }
			.date { font-size: 22px; font-weight: 700; fill: #9fe6e6; letter-spacing: 1px; }
			.record { font-size: 25px; font-weight: 900; fill: #ff555a; letter-spacing: 2px; }
			.athlete { font-size: 55px; font-weight: 900; letter-spacing: .5px; }
			.time { font-size: 112px; font-weight: 900; letter-spacing: -3px; }
			.ladder-title { font-size: 22px; font-weight: 900; letter-spacing: 2px; fill: #9fe6e6; }
			.level-name { font-size: 23px; font-weight: 900; letter-spacing: .8px; }
			.level-threshold { font-size: 22px; font-weight: 800; fill: #9fe6e6; }
			.level-result { font-size: 22px; font-weight: 800; }
			.level-empty { font-size: 20px; font-weight: 700; fill: #aebdca; letter-spacing: .7px; }
			.footer { font-size: 18px; font-weight: 800; fill: #c7d5df; letter-spacing: 2px; }
		</style>
	</svg>`;
}
