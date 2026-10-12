/**
 * Valid form types accepted by POST /api/challenge/v1/forms/<type>.
 * Stored into challenge_form_submissions (status NEW).
 */
export const VALID_FORM_TYPES = [
	"contact",
	"organization",
	"sponsor",
	"partner",
	"umbrella",
	"miles-campaign",
	"sponsor-miles",
	"performance-levels",
	"individual-instructor-application",
	"instructor-story",
	"board-listing",
	"instructor-training-org",
	"corporate-teams",
	"sponsor-kilometers",
] as const;
