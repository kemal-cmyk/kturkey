import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS Preflight (Browser security check)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Parse the date from the request
    const { date } = await req.json()
    if (!date) throw new Error('Date is required (YYYY-MM-DD)')

    console.log(`Received request for date: ${date}`)

    // 3. Prepare to fetch from TCMB
    // We create a date object. If the date is today, we might need yesterday's rate 
    // depending on the time, but for simplicity, we search for the specific date requested.
    // If it's a weekend/holiday, TCMB returns 404, so we loop backwards.
    
    let targetDate = new Date(date)
    let foundRate = null
    let attempts = 0
    const MAX_LOOKBACK_DAYS = 7 // Look back up to a week (covers long holidays)

    while (!foundRate && attempts < MAX_LOOKBACK_DAYS) {
      // Format date for TCMB URL: https://www.tcmb.gov.tr/kurlar/202401/12012024.xml
      const d = targetDate.getDate().toString().padStart(2, '0')
      const m = (targetDate.getMonth() + 1).toString().padStart(2, '0')
      const y = targetDate.getFullYear()
      
      const urlDatePath = `${y}${m}/${d}${m}${y}.xml`
      const tcmbUrl = `https://www.tcmb.gov.tr/kurlar/${urlDatePath}`

      console.log(`Attempt ${attempts + 1}: Fetching ${tcmbUrl}`)
      
      try {
        const response = await fetch(tcmbUrl)
        
        if (response.ok) {
          const xmlText = await response.text()
          
          // 4. Parse XML using Regex (Faster/Simpler than importing an XML parser in Deno)
          // We look for ForexSelling (Döviz Satış)
          
          // Match EUR
          const eurMatch = xmlText.match(/<Currency CrossOrder="9" Kod="EUR".*?<ForexSelling>([0-9.]+)<\/ForexSelling>/s)
          // Match USD
          const usdMatch = xmlText.match(/<Currency CrossOrder="0" Kod="USD".*?<ForexSelling>([0-9.]+)<\/ForexSelling>/s)
          // Match GBP (CrossOrder 4 usually)
          const gbpMatch = xmlText.match(/<Currency CrossOrder="4" Kod="GBP".*?<ForexSelling>([0-9.]+)<\/ForexSelling>/s)

          if (eurMatch) {
            foundRate = {
              requestedDate: date,
              effectiveDate: `${y}-${m}-${d}`, // The actual date the rate is from
              EUR: parseFloat(eurMatch[1]),
              USD: usdMatch ? parseFloat(usdMatch[1]) : 0,
              GBP: gbpMatch ? parseFloat(gbpMatch[1]) : 0
            }
            console.log("Rates found:", foundRate)
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch for ${urlDatePath}`)
      }

      if (!foundRate) {
        // Go back one day
        targetDate.setDate(targetDate.getDate() - 1)
        attempts++
      }
    }

    if (!foundRate) {
      throw new Error(`Could not find TCMB rate near date ${date}`)
    }

    // 5. Return the result
    return new Response(JSON.stringify(foundRate), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})