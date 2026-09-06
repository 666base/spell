// dictionary-bg only exports Node's index.js. Import the Hunspell files
// by path so Vite does not resolve them through package "exports".
import aff from "../../node_modules/dictionary-bg/index.aff?raw";
import dic from "../../node_modules/dictionary-bg/index.dic?raw";

export const bgAffix = aff;
export const bgWords = dic;
