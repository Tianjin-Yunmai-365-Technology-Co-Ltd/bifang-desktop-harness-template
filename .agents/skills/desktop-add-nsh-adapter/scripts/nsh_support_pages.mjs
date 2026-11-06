/** 将封闭品牌支持内容映射到 NSH 原生控件，不把翻译键或图片 alt 当正文。 */
export function renderNshSponsor(translations,profile) {
  const values=locale=>translations[locale].sponsor;
  const localized=(zh,en)=>`if chinese { ${JSON.stringify(zh)} } else { ${JSON.stringify(en)} }`;
  const label=key=>localized(values('zh-CN')[key],values('en-US')[key]);
  const paragraph=key=>`.child(text(${label(key)}))`;
  const cards=profile.sponsor.tiers.map(tier=>{
    const benefits=locale=>tier.benefits.map(item=>[values(locale)[item.mainKey.split('.').at(-1)],item.noteKey?values(locale)[item.noteKey.split('.').at(-1)]:null].filter(Boolean).join('\n')).join('\n\n');
    return `.child(view().w_full().style_when(move || window().width >= px(super::tokens::NARROW), |s| s.w(px(super::tokens::SPONSOR_CARD))).p_4().gap_4().rounded_lg().bg(move || theme().muted)
      .child(image(asset!(${JSON.stringify(tier.image)})).label(${label(tier.imageAltKey.split('.').at(-1))}).w(px(super::tokens::MEDIA)).h(px(super::tokens::MEDIA)))
      .child(text(${label(tier.nameKey.split('.').at(-1))}).text_size(px(super::tokens::TITLE)))
      .child(text(${JSON.stringify(`CNY ${tier.price}`)}))
      .child(text(${localized(benefits('zh-CN'),benefits('en-US'))})))`;
  }).join('\n');
  const payments=profile.sponsor.payments.map(payment=>`.child(view().gap_2().child(text(${label(payment.altKey.split('.').at(-1))})).child(image(asset!(${JSON.stringify(payment.image)})).label(${label(payment.altKey.split('.').at(-1))}).w(px(super::tokens::MEDIA)).h(px(super::tokens::MEDIA))))`).join('\n');
  return `//! 条件赞助页；材料本地打包，只展示，不创建支付动作。
use nsh_core::prelude::*;
use nsh_base::theme;
/// 使用同一主题和明确档位展示支持内容。
pub fn page(chinese: bool) -> impl IntoElement {
 view().w_full().gap_4()
   .child(text(${label('title')}).text_size(px(super::tokens::TITLE)))
   ${paragraph('subtitle_no_service')}
   ${paragraph('sponsor_message')}
   .child(view().flex_row().flex_wrap().gap_4() ${cards})
   ${paragraph('payment_instructions')}
   .child(view().flex_row().flex_wrap().gap_4() ${payments})
}
`;
}
