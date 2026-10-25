import { NextRequest, NextResponse } from "next/server"
import { sdk } from "@lib/config"
import {
  answerStoreQuestion,
  type SearchableMedusaProduct,
} from "@lib/cctv-support"

/**
 * Public, read-only and no-cost fallback. No model inference, contact capture,
 * order placement, paid provider API, cookies or chat transcript persistence.
 */
export async function GET(req: NextRequest) {
  const question=req.nextUrl.searchParams.get("q")??""
  if(question.trim().length<2 || question.length>160){
    return NextResponse.json({error:"Question must be 2–160 characters"},{
      status:400,headers:{"Cache-Control":"no-store"},
    })
  }
  let first
  try {
    first=answerStoreQuestion(question)
  } catch {
    return NextResponse.json({error:"Invalid question"},{
      status:400,headers:{"Cache-Control":"no-store"},
    })
  }
  let products:SearchableMedusaProduct[]=[]
  // The only grounded product source is Medusa's EXISTING public Store API.
  // Never read or send any admin product drafts, merchant keys or stock tables.
  if(first.intent==="product" && process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) {
    try {
      const result=await sdk.store.product.list({
        q:question.trim(),limit:5,
        fields:"id,title,handle,status,+metadata",
      })
      products=(result.products??[]) as SearchableMedusaProduct[]
    } catch {
      // Missing/disconnected merchant catalogue must not create fake answers.
      products=[]
    }
  }
  return NextResponse.json(answerStoreQuestion(question,products),{
    headers:{
      "Cache-Control":"no-store, max-age=0",
      "X-Content-Type-Options":"nosniff",
    },
  })
}
