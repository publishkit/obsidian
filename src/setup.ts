import { Modal, Setting } from "obsidian";
import PKPlugin from "../main";

interface Data {
	vault: { export_folder: string };
	site: { id: string; name: string };
}

export default class SetupModal extends Modal {
	data: Data;
	pkplugin: PKPlugin;
	callback: Function;

	constructor(pkplugin: PKPlugin, callback: Function) {
		super(app);
		this.pkplugin = pkplugin;
		this.callback = callback;
	}

	onSubmit() {
		this.callback(this.data);
	}

	onOpen() {
		const { contentEl, pkplugin } = this;
		const { pklib } = pkplugin;

		const data: Data = (this.data = {
			vault: { export_folder: pklib.env.vault + "/kit" },
			site: { id: "", name: "" },
		});

		this.data.site.name = pklib.utils.s.capitalize(pklib.env.vault.split('/').pop()?.replace(/-/g, ' '));

		contentEl.createEl("h1", { text: "Publish Kit Setup" });

		new Setting(contentEl)
			.setName("Export Folder")
			.setDesc("absolute path - ex: /Users/batman/mywebsite")
			.addText((text) => {
				return text
					.setValue(data.vault.export_folder)
					.onChange((value) => {
						data.vault.export_folder = value;
					});
			});

		new Setting(contentEl)
			.setName("Site ID")
			.setDesc("ex: rec_xxxxxxx")
			.addText((text) => {
				return text.setValue(data.site.id).onChange((value) => {
					data.site.id = value;
				});
			});

		new Setting(contentEl).setName("Site Name").addText((text) => {
			return text.setValue(data.site.name).onChange((value) => {
				data.site.name = value;
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit();
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
