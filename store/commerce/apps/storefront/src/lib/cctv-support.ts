/**
 * STORE-021: safe bilingual, catalogue-grounded customer support.
 *
 * Deterministic assistant fallback while hosted LLM providers are OFF.
 * Does not fabricate prices, inventory, warranties or courier availability.
 * Never sends messages, creates leads, completes orders or calls paid AI.
 */
export type SupportedLanguage = "ml" | "en"
type Intent="price"|"shipping"|"warranty"|"installation"|"payment"|"stock"|"product"|"other"
export interface StoreAssistantResult {
  language:SupportedLanguage
  intent:Intent
  answer:string
  product?:{id:string;title:string;handle:string}|null
  needsHuman:boolean
  customerInitiatedWhatsapp:string
  generativeAiUsed:false
}
export interface SearchableMedusaProduct {
  id:string
  title:string
  handle:string
  status?:string
  metadata?:Record<string,unknown>|null
}
const phone="916235353732"
const waLink="https://wa.me/"+phone
const ml=/[\u0D00-\u0D7F]/
const intentTokens:Record<Exclude<Intent,"other">,RegExp>={
  price:/price|cost|rate|offer|amount|₹|വില|എത്ര|നിരക്ക്|പ്രൈസ്|പൈസ/i,
  shipping:/ship|courier|delivery|pincode|pin code|freight|shiprocket|ഡെലിവറി|കൊറിയർ|അയക്ക|പിൻകോഡ്|ഷിപ്പിങ്/i,
  warranty:/warrant|guarantee|service period|വാറന്റി|ഗ്യാരന്റി|ഉറപ്പ്/i,
  installation:/install|fitting|setup|technician|ഇൻസ്റ്റല|സെറ്റപ്പ്|ഫിറ്റിങ്|ടെക്‌നീഷ്യ/i,
  payment:/payment|cod|cash on delivery|upi|cashfree|പേയ്മെന്റ്|പണമട|ക്യാഷ്|സിഒഡി/i,
  stock:/stock|available|ready|ലഭ്യമ|സ്റ്റോക്ക്|ഉണ്ടോ/i,
  product:/camera|cctv|hikvision|dahua|dvr|nvr|kit|package|ക്യാമറ|സിസിടിവി|പാക്കേജ്/i,
}
const responses:Record<Intent,{ml:string;en:string}>={
  price:{
    ml:"ക്യാമറ പാക്കേജിന്റെ വില സ്ഥിരീകരിച്ച Medusa catalogue-ിൽ നിന്നാണ് നൽകേണ്ടത്. ഇപ്പോൾ ഞങ്ങൾക്ക് വിശ്വാസയോഗ്യമായ live വില ലഭ്യമല്ല. ശരിയായ quote ലഭിക്കാൻ Minarva Technologies-നെ ബന്ധപ്പെടുക.",
    en:"Package pricing must come from an approved live Medusa catalogue. A verified price is not available here yet. Contact Minarva Technologies for an accurate quotation.",
  },
  shipping:{
    ml:"കേരളത്തിലെ ഡെലിവറി ലഭ്യതയും charge-ഉം PIN code, യഥാർത്ഥ പാക്കിംഗ് weight, courier quote എന്നിവയുടെ അടിസ്ഥാനത്തിലാണ്. സ്ഥിരീകരിച്ച തുക ഇല്ലാതെ delivery rate പറയില്ല.",
    en:"Kerala delivery serviceability and charges depend on the PIN code, measured packed weight and a verified courier quote. We cannot promise a rate until these are checked.",
  },
  warranty:{
    ml:"വാറന്റി ഓരോ പാക്കേജിലെയും ക്യാമറ, DVR/NVR, മറ്റ് ഭാഗങ്ങൾ എന്നിവയ്ക്ക് വ്യത്യസ്തമായിരിക്കാം. സ്ഥിരീകരിച്ച ഉൽപ്പന്ന വ്യവസ്ഥകൾ ലഭ്യമാകാതെ കാലാവധി ഉറപ്പു നൽകില്ല.",
    en:"Warranty terms may differ for cameras, DVR/NVR and accessories. We cannot promise coverage or a duration without verified product terms.",
  },
  installation:{
    ml:"Installation പാക്കേജ് വിലയിൽ ഉൾപ്പെട്ടിട്ടുണ്ടോ എന്ന് ഓരോ offer-ലും വ്യക്തമായി ഉറപ്പാക്കണം. Site visit, wiring, fitting എന്നിവയ്ക്ക് അധിക charges വരാം. സ്ഥിരീകരിച്ച quote ആവശ്യമാണ്.",
    en:"Whether installation is included must be confirmed for each package. Site visits, wiring and fitting may incur extra charges. Request an approved quote.",
  },
  payment:{
    ml:"Customer checkout-ഉം Cashfree live payment-ഉം ഇപ്പോഴും പ്രവർത്തനക്ഷമമാക്കിയിട്ടില്ല. Partial COD ലഭ്യമാണെന്ന് ഇപ്പോൾ ഉറപ്പു നൽകാനാവില്ല. ഔദ്യോഗിക സ്ഥിരീകരണമില്ലാതെ പണം അയക്കരുത്.",
    en:"Live checkout and Cashfree payments are not enabled yet. Partial COD cannot be promised until courier approval. Do not send payment without official confirmation.",
  },
  stock:{
    ml:"യഥാർത്ഥ stock സ്ഥിരീകരിക്കാതെ പാക്കേജ് ലഭ്യമാണെന്ന് ഉറപ്പാക്കാനാവില്ല. നിലവിലെ availability അറിയാൻ Minarva Technologies-നെ ബന്ധപ്പെടുക.",
    en:"Package availability cannot be guaranteed without confirmed live stock. Contact Minarva Technologies to verify availability.",
  },
  product:{
    ml:"CCTV പാക്കേജുകളുടെ യഥാർത്ഥ specifications, kit contents, ബ്രാൻഡ്, warranty എന്നിവ approved catalogue പരിശോധിച്ചാണ് സ്ഥിരീകരിക്കേണ്ടത്. നിങ്ങളുടെ ആവശ്യം പറഞ്ഞാൽ ടീമിനെ ബന്ധപ്പെടാനുള്ള വഴി നൽകാം.",
    en:"CCTV package specifications, included components, brand and warranty must be verified against the approved catalogue. Share your requirement with the team for an accurate answer.",
  },
  other:{
    ml:"CCTV camera packages, installation, warranty, delivery, payment തുടങ്ങിയ സംശയങ്ങൾക്ക് സഹായിക്കാം. ലഭ്യമല്ലാത്ത വിവരങ്ങൾ ഞാൻ ഊഹിച്ച് പറയില്ല. വിശദമായ സഹായത്തിന് Minarva Technologies-നെ ബന്ധപ്പെടുക.",
    en:"I can help with CCTV packages, installation, warranty, delivery and payment questions. I won't guess missing details. Contact Minarva Technologies for specific assistance.",
  },
}
export function answerStoreQuestion(input:string,products:SearchableMedusaProduct[]=[]):StoreAssistantResult{
  if(typeof input!=="string"||input.trim().length<2||input.length>160){
    throw new TypeError("Question must be between 2 and 160 characters")
  }
  const q=input.trim()
  const language:SupportedLanguage=ml.test(q)?"ml":"en"
  let intent:Intent="other"
  for(const [key,re] of Object.entries(intentTokens) as [Exclude<Intent,"other">,RegExp][]){
    if(re.test(q)){intent=key;break}
  }
  // Catalogue data is untrusted until Medusa merchant approval. No price or
  // stock is returned from an unverified public product record.
  const approved=products.filter(p=>
    p && p.status==="published" &&
    p.metadata?.minarva_sale_approved===true &&
    typeof p.title==="string"&&p.title.trim() &&
    typeof p.handle==="string"&&/^[a-z0-9-]{3,100}$/.test(p.handle))
  const hay=q.toLocaleLowerCase()
  const match=intent==="product"?
    approved.find(p=>p.title.toLocaleLowerCase().includes(hay) ||
      hay.includes(p.title.toLocaleLowerCase())):undefined
  const ans=responses[intent][language]
  return Object.freeze({
    language,intent,answer:ans,
    ...(match?{product:{id:match.id,title:match.title,handle:match.handle}}:{}),
    needsHuman:true,
    customerInitiatedWhatsapp:waLink,
    generativeAiUsed:false,
  })
}
