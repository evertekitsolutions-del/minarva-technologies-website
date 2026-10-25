"use client"

import { FormEvent, useState } from "react"

type Answer={
  language:"ml"|"en"
  answer:string
  product?:{id:string;title:string;handle:string}
  customerInitiatedWhatsapp:string
  needsHuman:boolean
  generativeAiUsed:false
}

export default function CctvSupport() {
  const [open,setOpen]=useState(false)
  const [question,setQuestion]=useState("")
  const [result,setResult]=useState<Answer|null>(null)
  const [error,setError]=useState("")
  const [pending,setPending]=useState(false)

  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    const asked=question.trim()
    if(asked.length<2||asked.length>160||pending)return
    setPending(true)
    setError("")
    setResult(null)
    try{
      const response=await fetch("/api/cctv-support?q="+encodeURIComponent(asked),{
        method:"GET",
        cache:"no-store",
        headers:{"Accept":"application/json"},
      })
      if(!response.ok)throw new Error("Unavailable")
      const data=await response.json() as Answer
      if(typeof data.answer!=="string")throw new Error("Invalid response")
      setResult(data)
    }catch{
      setError("Support information is temporarily unavailable. Please contact Minarva Technologies.")
    }finally{
      setPending(false)
    }
  }

  return (
    <aside className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {open&&(
        <div className="w-[min(360px,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Minarva CCTV Support</h2>
              <p className="mt-1 text-xs text-gray-600">
                മലയാളം / English · Catalogue-based answers
              </p>
            </div>
            <button aria-label="Close CCTV help" type="button"
              className="rounded p-1 text-sm text-gray-700 hover:bg-gray-100"
              onClick={()=>setOpen(false)}>Close</button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-700">
            Payment and delivery are not enabled yet. No AI model or personal
            chat history is used. We do not guess unverified details.
          </p>
          <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
            <label htmlFor="minarva-cctv-question" className="text-xs font-medium">
              Camera package question / നിങ്ങളുടെ ചോദ്യം
            </label>
            <input
              id="minarva-cctv-question"
              autoComplete="off"
              maxLength={160}
              value={question}
              onChange={e=>setQuestion(e.target.value)}
              placeholder="Warranty, delivery, CCTV packages..."
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
            />
            <button disabled={pending||question.trim().length<2}
              className="rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="submit">{pending?"Checking…":"Ask / ചോദിക്കൂ"}</button>
          </form>
          <div aria-live="polite" role="status" className="mt-3 text-sm">
            {result&&<>
              <p className="leading-relaxed">{result.answer}</p>
              {result.product&&
                <p className="mt-2 font-medium">Catalogue: {result.product.title}</p>}
            </>}
            {error&&<p className="text-red-700">{error}</p>}
          </div>
          <a href="https://wa.me/916235353732"
            target="_blank" rel="noopener noreferrer"
            className="mt-3 block rounded border border-gray-300 px-3 py-2 text-center text-sm font-medium"
            aria-label="Contact Minarva Technologies on WhatsApp">
            Contact our team on WhatsApp
          </a>
          <p className="mt-2 text-xs text-gray-600">
            WhatsApp opens only when you select the link. No automatic messages.
          </p>
        </div>
      )}
      <button type="button"
        className="rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-lg"
        aria-label={open?"Hide CCTV support":"Open CCTV support"}
        aria-expanded={open}
        onClick={()=>setOpen(v=>!v)}>
        {open?"Hide help":"CCTV Help / സഹായം"}
      </button>
    </aside>
  )
}
