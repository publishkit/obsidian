import { SuggestModal } from "obsidian";
import PKPlugin from "../main";
import { Commands } from "./commands";


export default class Launcher extends SuggestModal<any> {
	pkplugin: PKPlugin;
	utils: any;

	constructor(pkplugin: PKPlugin) {
		super(app);
		this.pkplugin = pkplugin;
		this.utils = pkplugin.pklib.utils;
	}

	// Returns all available suggestions.
	getSuggestions(query: string): any[] {
		return Commands.filter((item) =>
			item.name.toLowerCase().includes(query.toLowerCase())
		);
	}

	// Renders each suggestion item.
	renderSuggestion(item: any, el: HTMLElement) {
		el.createEl("div", { text: item.name });
		// el.createEl("small", { text: item.desc });
	}

	// Perform action on the selected suggestion.
	onChooseSuggestion(item: any, evt: MouseEvent | KeyboardEvent) {
		this.pkplugin.runCommand(item.id);
	}
}
