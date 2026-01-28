// supabase/functions/get-tcmb-rate/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { date } = await req.json() // Expects 'YYYY-MM-DD'
    if (!date) throw new Error('Date is required')

    // TCMB Format: https://www.tcmb.gov.tr/kurlar/202401/12012024.xml
    // Note: TCMB does not publish on weekends/holidays. We must try backwards.
    
    const targetDate = new Date(date)
    let foundRate = null
    let attempts = 0
    
    // Try up to 5 days back to find a working day
    while (!foundRate && attempts < 5) {
      const d = targetDate.getDate().toString().padStart(2, '0')
      const m = (targetDate.getMonth() + 1).toString().padStart(2, '0')
      const y = targetDate.getFullYear()
      const urlDate = `${y}${m}/${d}${m}${y}.xml`
      const tcmbUrl = `https://www.tcmb.gov.tr/kurlar/${urlDate}`

      console.log(`Fetching: ${tcmbUrl}`)
      
      const response = await fetch(tcmbUrl)
      
      if (response.ok) {
        const xmlText = await response.text()
        
        // Simple Regex Parsing (Robust enough for TCMB's fixed format)
        // Look for EUR
        const eurMatch = xmlText.match(/<Currency CrossOrder="9" Kod="EUR".*?<BanknoteSelling>([0-9.]+)<\/BanknoteSelling>/s)
        const usdMatch = xmlText.match(/<Currency CrossOrder="0" Kod="USD".*?<BanknoteSelling>([0-9.]+)<\/BanknoteSelling>/s)
        
        if (eurMatch) {
          foundRate = {
            date: `${y}-${m}-${d}`,
            EUR: parseFloat(eurMatch[1]),
            USD: usdMatch ? parseFloat(usdMatch[1]) : 0
          }
        }
      }

      if (!foundRate) {
        // Go back one day
        targetDate.setDate(targetDate.getDate() - 1)
        attempts++
      }
    }

    if (!foundRate) throw new Error('Could not find TCMB rate within 5 days')

    return new Response(JSON.stringify(foundRate), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})