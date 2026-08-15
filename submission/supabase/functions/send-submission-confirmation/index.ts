import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { submission_id } = await req.json()
    const { data: submission, error } = await supabase
      .from('submissions')
      .select('submission_number,title_zh,title_en,status,profiles!submissions_owner_id_fkey(email,full_name_zh)')
      .eq('id', submission_id)
      .single()
    if (error || !submission) throw error || new Error('Submission not found')

    const resend = new Resend(Deno.env.get('RESEND_API_KEY')!)
    const from = Deno.env.get('RESEND_FROM') || 'NCFD2026 <noreply@example.com>'
    const site = 'https://chihyungwu0811.github.io/NCFD2026/'
    const recipient = submission.profiles?.email
    if (!recipient) throw new Error('Recipient email missing')

    const { error: mailError } = await resend.emails.send({
      from,
      to: [recipient],
      subject: `【NCFD2026】投稿完成通知 ${submission.submission_number}`,
      html: `<p>${submission.profiles?.full_name_zh || '投稿者'}您好：</p>
        <p>您的投稿已完成正式提交。</p>
        <p><strong>投稿編號：</strong>${submission.submission_number}<br>
        <strong>題目：</strong>${submission.title_zh || submission.title_en}</p>
        <p>您可登入 <a href="${site}dashboard.html">投稿者中心</a> 查詢或於開放期間修改資料。</p>
        <p>2026 全國計算流體力學會議籌備委員會</p>`,
    })
    if (mailError) throw mailError
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
