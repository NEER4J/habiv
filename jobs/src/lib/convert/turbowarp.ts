import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Packages a Scratch .sb3 into a single self-contained index.html with the TurboWarp packager. */
export async function packageScratch(sb3: Buffer, title: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Packager: any = require("@turbowarp/packager");
  const loaded = await Packager.loadProject(sb3, () => {});
  const packager = new Packager.Packager();
  packager.project = loaded;
  packager.options.target = "html";
  packager.options.app.windowTitle = title;
  packager.options.autoplay = true;
  packager.options.loadingScreen.text = title;
  packager.options.custom.js = `
    (function(){function hook(){if(!window.Habiv||!window.vm)return setTimeout(hook,250);Habiv.ready();
      vm.runtime.on('PROJECT_START',function(){Habiv.runStart();});
      vm.runtime.on('PROJECT_RUN_STOP',function(){Habiv.runEnd({outcome:'complete'});});}hook();})();`;
  const result = await packager.package();
  if (result.type !== "text/html") throw new Error(`unexpected packager output ${result.type}`);
  return Buffer.from(result.data);
}
