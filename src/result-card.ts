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
	logoUrl?: string;
}

export const RESULT_CARD_DESIGN_BLOCKER =
	"Approved Gemini-created NWANA background family is not installed";

export function isResultCardDesignReady(): boolean {
	return false;
}

/**
 * Result cards are deliberately blocked until the owner approves a real visual
 * family. The former geometric SVG placeholders were visually rejected and
 * must never be treated as publication-ready assets.
 *
 * Gemini in Google Workspace for Nonprofits will be used to create varied
 * background compositions. Engine will then overlay the verified names,
 * performance levels and times at phone-readable sizes so generative imagery
 * can never alter official result data.
 */
export function buildResultCardSvg(_input: ResultCardInput): string {
	throw new Error(RESULT_CARD_DESIGN_BLOCKER);
}
