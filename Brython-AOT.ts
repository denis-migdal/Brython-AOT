import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";
import {exists} from "https://deno.land/std/fs/mod.ts"
import { dirname, basename } from "https://deno.land/std/path/mod.ts";

const flags = parse(Deno.args, {
	boolean: ["usage", "watch"],
	string: ["src", "dst"],
	default: { help: false, watch: false },
});

if(flags.usage) {
	console.log('deno run --allow-read --allow-write Brython-AOT.ts [--watch] --src SRC_DIR --dst DST_DIR');
	Deno.exit(0);
}

function filter(path) {
	return path.endsWith('.py') || path.endsWith('.bry');
}

function getDstPath(path) {
	return DST_DIR + '/' + path.slice( SRC_DIR.length ) + '.js';
}

/* ACTIONS */
async function convertFile(src, dst) {

	console.log('Converting', src, 'to', dst);
	
	const dstdir = await dirname(dst);
	if( ! await exists(dstdir) )
		await Deno.mkdir(dstdir, { recursive: true });
	
	const pycode = await Deno.readTextFile(src);
	const jscode = "ok"; //TODO
	await Deno.writeTextFile(dst, jscode);
}

async function isDirEmpty(path) {

	for await (const dirEntry of Deno.readDir(path) )
		return false;
	return true;
}

async function removeFile(path) {
	console.log('Removing file', path);
	
	await Deno.remove(path);
	
	let pathDir = await dirname(path);
	while( await isDirEmpty(pathDir) ) {
			
		console.log('Removing dir', pathDir);
		await Deno.remove(pathDir);
		pathDir = await dirname(pathDir);
	}
	
}

/* Program */

const {src: SRC_DIR, dst: DST_DIR, watch} = flags;

console.log('** loading Brython parser **');

const PARSER_SCRIPT = await Deno.readTextFile( Deno.cwd() + '/brython_standard_parser.js' );

window.__BRYTHON__ = {};

window.location = {
	href: "http://localhost/",
	origin: "http://localhost",
	pathname: "/"
};
window.document = {
	getElementsByTagName: () => [{src: "http://localhost/"}]
};
window.MutationObserver = function() { this.observe = () => {};  }

eval(PARSER_SCRIPT);

console.log( __BRYTHON__.to_js( __BRYTHON__.py2js("print('toto')", "toto") ) );

console.log('** converting existing files **');

for await (const walkEntry of walk(SRC_DIR) ) {
  
	const path = walkEntry.path;
	
	if( ! walkEntry.isFile || ! filter(path) )
		continue;

	await convertFile( path, getDstPath(path) );
}

if( watch ) {

	console.log("** now listening for changes **");

	const watcher = Deno.watchFs(SRC_DIR, {recursive: true});
	for await (const event of watcher) {
		
		const paths = event.paths.filter( path => filter(path) );
		if(paths.length === 0)
			continue;
		
		if( event.kind === "modify" ) {
		
			if( event.paths.length === 2 ) { // this is move file...
			
				const [srcfile, dstfile] = event.paths;
				if( filter(srcfile) )
					await removeFile( getDstPath(srcfile) );
				if( dstfile.startsWith(SRC_DIR) && filter( dstfile ) )
					await convertFile(dstfile, getDstPath(dstfile) );
				
				continue;
			}
		
			for(let path of paths)
				await convertFile(path, getDstPath(path) )
		}
				
		if( event.kind === "remove" )
			for(let path of paths)
				await removeFile( getDstPath(path) );
	}

}
