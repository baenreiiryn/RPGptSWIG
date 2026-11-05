import generated from './catalog.generated.json' with {type:'json'};
import actorData from './actors.generated.json' with {type:'json'};
import type {CyberpunkEra,Stat} from './types';
export type CyberEntry={id:string;name:string;type:string;era:CyberpunkEra;description:string;source:{book?:string;page?:number};art?:string;data:{[key:string]:unknown;stat?:Stat;difficulty?:string;mainRoleAbility?:string;price?:{market?:number};humanityLoss?:{static?:string;roll?:string};type?:string;size?:number;isFoundational?:boolean;installedItems?:{allowed?:boolean;slots?:number};magazine?:{value?:number;max?:number};isBodyLocation?:boolean;isHeadLocation?:boolean;bodyLocation?:{sp?:number};headLocation?:{sp?:number};penalty?:number;damage?:string;weaponSkill?:string;rof?:number}};
const npcEntries:CyberEntry[]=actorData.map(a=>({id:'npc:'+a.id,name:a.name,type:'npc',era:2045,description:'Ficha de referência do mundo Foundry original, ambientado em 2055. O Mestre adapta a presença deste personagem à época da campanha.',source:{book:'Arquivo de atores · mundo original 2055'},art:a.art||undefined,data:{actorId:a.id,npcStats:a.stats,npcHp:a.hp,npcRole:a.role}}));
export const cyberCatalog=[...generated as unknown as CyberEntry[],...npcEntries];
export const roles=cyberCatalog.filter(e=>e.type==='role');
const skills=new Map<string,CyberEntry>();for(const e of cyberCatalog.filter(e=>e.type==='skill'))if(!skills.has(e.name))skills.set(e.name,e);
export const skillEntries=[...skills.values()].sort((a,b)=>a.name.localeCompare(b.name));
export const TYPE_LABELS:Record<string,string>={weapon:'Armas',armor:'Armaduras',cyberware:'Cyberware',gear:'Equipamentos',ammo:'Munição',role:'Papéis',skill:'Perícias',program:'Programas',cyberdeck:'Cyberdecks',vehicle:'Veículos',itemUpgrade:'Modificações',clothing:'Vestuário',drug:'Drogas',criticalInjury:'Ferimentos críticos',netarch:'Arquiteturas NET',npc:'NPCs / Atores'};
export const entriesForEra=(era:CyberpunkEra)=>cyberCatalog.filter(e=>e.era===2045||era===2077);
export const findCyberEntry=(id:string)=>cyberCatalog.find(e=>e.id===id);
export const priceOf=(e:CyberEntry)=>Math.max(0,Number(e.data.price?.market)||0);
export const humanityLossOf=(e:CyberEntry)=>Math.max(0,Number(e.data.humanityLoss?.static)||0);
export function entryArt(e:CyberEntry){if(e.art)return e.art;if(e.type==='cyberware')return /arm|blade|wire/i.test(e.name)?'/cyberpunk/arm.webp':/leg/i.test(e.name)?'/cyberpunk/legs.webp':'/cyberpunk/neural.webp';if(e.type==='program'||e.type==='cyberdeck')return '/cyberpunk/cyberdeck.webp';return undefined;}
