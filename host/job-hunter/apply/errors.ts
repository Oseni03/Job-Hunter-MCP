export class FillError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "FillError";
		this.code = code;
	}
}
