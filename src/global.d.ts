interface ObjectAny {
	[key: string]: any;
}

interface Commands {
	id: string;
	name: string;
	desc: string;
}

interface Asset {
	path: string;
	filename: string;
	ext: string;
	subpath: string;
	hash: string;
	type: string;
	src?: string;
	url?: string;
	content?: string;
	err?: string;
	html?: string;
}
