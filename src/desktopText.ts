import {getLanguage} from './i18n/core';
export const tx=(ru:string,en:string)=>getLanguage()==='ru'?ru:en;
