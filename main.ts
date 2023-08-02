import { Plugin, App, Notice, TFile, TFolder, Vault } from "obsidian";
import Obs from "src/obs";
import Setup from "src/setup";
import Launcher from "src/launcher";
import Report from "src/report";
import { Commands } from "src/commands";
// @ts-ignore
import PKLib from "@publishkit/pklib";

// @ts-ignore
// import jsdom from "jsdom"

class PKPlugin extends Plugin {
	pklib: PKLib;
	obs: Obs;
	verbose: boolean;
	statusbar: HTMLElement;

	#log = (...args: any[]) => {
		this.verbose && console.log(`publishkit ➔`, ...args);
	};

	notice = (str: string, time: number = 4000) => {
		new Notice(str, time);
	};

	async onload() {
		this.verbose = true;
		this.pklib = new PKLib({ verbose: true });
		// this.pklib.parser.jsdom = jsdom;
		this.obs = new Obs(this);

		const iconCurrent = this.addRibbonIcon(
			"paper-plane",
			"PublishKit",
			(evt: MouseEvent) => {
				this.startLauncher();
			}
		);

		if (!this.app.workspace.layoutReady)
			this.app.workspace.onLayoutReady(async () => {
				this.init();
			});
		else this.init();
	}

	init = () => {
		const { pklib } = this;
		// @ts-ignore
		window.pklib = pklib;

		if (pklib.error) return this.notice(pklib.error, 10000);

		if (!pklib.kitrc) return this.initSetup();
		if (!pklib.cfg("vault.kit_folder")) {
			const msg = '💥 missing "vault.kit_folder" setting in kitrc.md';
			return this.notice(msg);
		}

		this.statusbar = this.addStatusBarItem();
		this.bindObsidian();
		this.initCommands();

		this.app.metadataCache.on("changed", async (file) => {
			try {
				if (file.path == "kitrc.md") {
					pklib.reloadKitrc();
				}
			} catch (e) {
				this.notice(pklib.betterError(e));
			}
		});

		this.app.workspace.on("file-open", (file) => {
			if (pklib.isProcessing) return;
			this.runCommand("displayStatus", file);
		});

		this.#log("inited");
	};

	private displayStatus = async (file: TFile | null) => {
		if (!file || this.pklib.isProcessing) return;
		const path = file.path.replace(".md", ".html");
		const exist = await this.pklib.kit.fileExist(path);
		const text = "🟢";
		this.statusbar.empty();
		exist && this.statusbar.createEl("span", { text });
	};

	private initCommands = () => {
		Commands.forEach((c) => {
			this.addCommand({
				id: c.id,
				name: c.name,
				callback: () => {
					this.runCommand(c.id);
				},
			});
		});
	};

	private initSetup = () => {
		return new Setup(this, async (data: object) => {
			await this.pklib.createKitrc(data);
			const file = this.obs.getFile("kitrc.md");
			file && this.obs.openFile(file, { newPane: true });
		}).open();
	};

	public runCommand = async (key: string, ...args: any[]) => {
		// this.#log("run", key);
		if (!this.pklib.kitrc) return this.initSetup();
		(this as any)[key](...args);
	};

	startLauncher = () => {
		new Launcher(this).open();
	};

	startReport = () => {
		new Report(this).open();
	};

	public exportCurrentNote = async (options: ObjectAny) => {
		const file = app.workspace.getActiveFile();
		if (!file) return this.notice("no active note to export !");
		options = options || { follow: false };
		// options.dry = true;
		const result = await this.pklib.exportFile(file.path, options);
		this.notice(result.summary);
		console.log(result.summary);
	};

	// public exportCurrentNoteFollow = async () => {
	// 	this.exportCurrentNote({ follow: true });
	// };

	public exportAllNotes = async () => {
		const files = await this.pklib.vault.lsFiles();
		const result = await this.pklib.exportFile(files, { dry: true });
		this.startReport();
		// console.log("eresult", result);
	};

	private bindObsidian = () => {
		const { pklib, obs } = this;

		const getHTML = async () => {
			const leaf = this.app.workspace.activeLeaf;
			if (!leaf) throw new Error("no active leaf");
			const html = (
				leaf.view as any
			).modes.preview.renderer.sections.reduce(
				(p: any, c: any) => p + c.el.innerHTML,
				""
			);
			return html;
		};

		pklib.preExport = async () => {
			const needSwitch = await this.obs.switchMode("preview");
			return { needSwitch };
		};

		// @ts-ignore
		pklib.postExport = async ({ files, preExport }) => {
			const { needSwitch } = preExport;
			const [firstFile] = files;
			const lastFile = files[files.length - 1];
			// return to first opened file
			if (firstFile != lastFile) {
				const file = this.obs.getFile(firstFile);
				file &&
					(await this.obs.openFile(file, {
						mode: needSwitch ? "source" : "preview",
					}));
			} else needSwitch && (await this.obs.switchMode("source"));
		};

		pklib.parser.setCustomParseMD(async (file: any) => {
			file = obs.getFile(file);
			await obs.openFile(file, { mode: "preview" });
			await pklib.utils.g.timeout(pklib.cfg("obsidian.throttle") || 500);

			const frontmatter = obs.getFrontmatter(file);
			const tags = obs.getTags(file);
			const backlinks = obs.getBacklinks(file);
			const html = await getHTML();
			return { frontmatter, html, tags };
		});

		pklib.parser.setRemovers({
			el: ".collapse-indicator,.list-bullet,.inline-title,.embedded-backlinks,.copy-code-button,.frontmatter-container,.frontmatter,.markdown-preview-pusher,.mod-header,.markdown-embed-link,.markdown-embed,.embed-title",
			class: ".pdf-toolbar,.pdf-container,.list-view-ul,.table-view-table,.pdf-embed,.media-embed,.internal-embed,.has-list-bullet,.contains-task-list,.task-list-item,.task-list-item-checkbox,.is-checked,.dataview-inline-query,.image-embed,.is-loaded",
			attr: "rel,data-task,data-line,data-heading,data-href,aria-label,aria-label-position,referrerpolicy",
			emptyAttr: "class,data-callout-metadata,data-callout-fold",
			// emptyTags: "div,p",
		});

		pklib.parser.setTransformer(
			async (win: Window, txs: any[], pklib: PKLib) => {
				// @ts-ignore
				const { document: doc, $ } = win;
				const body = doc.querySelector("body");
				if (!body) return;

				const { fileToAsset, parser, vault } = pklib;

				const isInternal = (path: any) => {
					if (!path.startsWith("app://")) return "";
					const local = path.split(vault.base)[1].split("?")[0];
					return local;
				};

				txs.push([
					"a",
					async (el: any) => {
						const href = el.getAttribute("href") || "";
						if (!href) el.href = "javascript:void(0)";

						const file = app.metadataCache.getFirstLinkpathDest(
							href,
							""
						);

						el.removeAttribute("target");
						el.classList.remove("is-unresolved");
						el.classList.remove("internal-link");
						el.classList.remove("external-link");

						// wikilink
						if (file) {
							el.classList.add("internal-link");
							const asset = await fileToAsset(file.path);
							el.setAttribute("href", asset.url);
							parser.index(asset);
						} else {
							if (
								href.startsWith("https://") ||
								href.startsWith("//") ||
								href.startsWith("http://")
							)
								el.classList.add("external-link");
							else el.classList.add("internal-link");
						}

						if (el.classList.contains("external-link"))
							el.setAttribute("target", "_blank");
					},
				]);

				txs.push([
					"img",
					async (el: any) => {
						"alt,"
							.split(",")
							.map((attr) => el.removeAttribute(attr));
						const path = isInternal(el.getAttribute("src"));
						const asset = path && (await fileToAsset(path));

						if (!asset) return;
						el.setAttribute("src", asset.url);
						parser.index(asset);
					},
				]);

				txs.push([
					".pdf-embed",
					async (el: any) => {
						try {
							const filename = el.getAttribute("src");
							const path =
								filename &&
								`${obs.getAttachementsFolder()}/${filename}`;
							const asset = path && (await fileToAsset(path));

							if (!asset) return;
							parser.index(asset);

							const iframe = document.createElement("iframe");
							iframe.src = path;
							iframe.setAttribute("frameborder", "no");
							el.removeAttribute("style");
							$(el).addClass("pdf");
							$(el).empty().append(iframe);

							$(body).find(".pdf-content-container").parent().remove()
							$(body).find(".pdf-toolbar-left").parent().remove()
						} catch (e) {
							console.log("dsddd", e);
						}
					},
				]);

				txs.push([
					"ul > span",
					async (el: any) => {
						el.remove();
					},
				]);

				txs.push([
					"li > span",
					async (el: any) => {
						if (!$(el).html()) el.remove();
					},
				]);

				txs.push([
					"span",
					async (el: any) => {
						"alt,src"
							.split(",")
							.map((attr) => el.removeAttribute(attr));
					},
				]);

				txs.push([
					".block-language-dataviewjs",
					async (el: any) => {
						const content = $(
							`<ul>${$(el).find("> ul").html()}</ul>`
						);
						$(el).replaceWith(content);
					},
				]);

				// flatten embed recursivly
				txs.push([
					"body > .markdown-embed-content",
					async (el: any) => {
						const loop = (el: HTMLElement, level = 0) => {
							const html = el.innerHTML;
							if (!html) return false;
							level++;

							const root = $(html);
							const childs = root.find(
								"> .markdown-preview-sizer > div > .markdown-embed-content"
							);

							if (childs.length)
								childs
									.toArray()
									.map((el: HTMLElement) => loop(el, level));

							try {
								const content = root.find(
									"> .markdown-preview-sizer"
								);
								const divs = content.find("> div");

								divs.each(function () {
									const div = $(this);
									if (!div.find("> p")[0]) return;
									div.after(div.html());
									div.remove();
								});

								const final = content[0].innerHTML;

								if (!final) return el.remove();
								else {
									el.classList.remove(
										"markdown-embed-content"
									);
									el.classList.add("embed-content");
									el.innerHTML = final;
								}
							} catch (e) {
								console.log("err:flattening:embed", e);
							}
						};

						loop(el);
						// else el.replaceWith(`<div class="embed-note">${content}</div>`)

						// if(content) el.replaceWith(`<div class="embed-note">${content}</div>`)
						// else el.remove()
					},
				]);
			}
		);
	};
}

export default PKPlugin;
