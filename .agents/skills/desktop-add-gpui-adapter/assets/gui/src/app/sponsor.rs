//! 赞助页复用 Harness 已受管的品牌档位与本地媒体，不复制参考应用的产品身份。

use super::Shell;
use gpui_kit::{AnyElement, Context, FontWeight, IntoElement, ObjectFit, Window, component::{ActiveTheme, Icon}, assets::IconName, div, img, prelude::*, px};

impl Shell {
    /// 宽窗三列、窄窗一列；所有支付材料只作为已批准的静态图片展示。
    pub(super) fn sponsor_page(&self, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        div().relative().w_full().flex().flex_col().gap_5().p_4()
            .child(img("sponsor/bg.jpg").absolute().top_0().left_0().size_full().object_fit(ObjectFit::Cover).opacity(0.12))
            .child(div().relative().w_full().flex().flex_col().items_center().gap_2().py_2()
                .child(div().w_full().min_w_0().whitespace_normal().text_center().text_size(px(24.)).font_weight(FontWeight::BOLD).text_color(cx.theme().primary).child(self.t("sponsor.title")))
                .child(div().min_w_0().w_full().whitespace_normal().text_sm().child(format!("{}{}", self.t("sponsor.subtitle_no_service"), self.t("sponsor.subtitle_thanks"))))
                .child(div().min_w_0().w_full().whitespace_normal().text_sm().text_color(cx.theme().muted_foreground).child(format!("{} {} / {} / {} / {}", self.t("sponsor.capabilities_label"), self.t("sponsor.capability_browser"), self.t("sponsor.capability_proxy"), self.t("sponsor.capability_cloud"), self.t("sponsor.capability_rpa")))))
            .child(div().relative().w_full().grid().grid_cols(if window.viewport_size().width >= px(1100.) { 3 } else { 1 }).gap_4()
@@SPONSOR_TIERS@@
            )
            .child(div().relative().w_full().grid().grid_cols(if window.viewport_size().width >= px(1000.) { 2 } else { 1 }).gap_5().p_5()
                .rounded_lg().border_1().border_color(cx.theme().border).bg(cx.theme().secondary)
                .child(div().min_w_0().flex().flex_col().gap_3()
                    .child(div().min_w_0().w_full().whitespace_normal().text_lg().font_weight(FontWeight::SEMIBOLD).child(self.t("sponsor.payment_instructions")))
                    .child(div().min_w_0().w_full().whitespace_normal().text_sm().text_color(cx.theme().muted_foreground).child(self.t("sponsor.sponsor_message"))))
                .child(div().grid().grid_cols(2).gap_4().children([
                    ("sponsor/pay1.png", "sponsor.payment_wechat_alt"),
                    ("sponsor/pay2.png", "sponsor.payment_alipay_alt"),
                ].into_iter().map(|(image, key)| {
                    div().flex().flex_col().items_center().gap_2()
                        .child(div().w(px(120.)).h(px(136.)).bg(gpui_kit::rgb(0xFFFFFF))
                            .child(img(image).size_full().object_fit(ObjectFit::Contain)))
                        .child(div().min_w_0().w_full().whitespace_normal().text_xs().child(self.t(key)))
                }))))
            .into_any_element()
    }

    /// 三档内容从唯一受管 profile 编译生成，布局不包含订单或权益状态。
    fn sponsor_tier(&self, name: &str, price: u16, image: &'static str, benefits: &[(&str, Option<&str>)], cx: &Context<Self>) -> AnyElement {
        div().min_w_0().flex().flex_col().gap_3().p_4().rounded_lg()
            .border_1().border_color(cx.theme().border).bg(cx.theme().secondary)
            .child(div().min_w_0().w_full().whitespace_normal().text_xs().font_weight(FontWeight::SEMIBOLD).text_color(cx.theme().primary).child(self.t("sponsor.scan_to_sponsor")))
            .child(div().flex().items_center().gap_3()
                .child(img(image).size(px(64.)).object_fit(ObjectFit::Contain))
                .child(div().flex_1().min_w_0().flex().flex_col().gap_1()
                    .child(div().min_w_0().w_full().whitespace_normal().text_lg().font_weight(FontWeight::SEMIBOLD).child(self.t(name)))
                    .child(div().text_size(px(30.)).font_weight(FontWeight::BOLD).child(format!("{price} {}", self.t("sponsor.currency_unit"))))))
            .child(div().h(px(1.)).bg(cx.theme().border))
            .children(benefits.iter().map(|(main, note)| {
                div().flex().items_start().gap_2()
                    .child(Icon::new(IconName::Check).size(px(16.)).flex_shrink_0().text_color(cx.theme().primary))
                    .child(div().flex_1().min_w_0().flex().flex_col().gap_1()
                        .child(div().min_w_0().w_full().whitespace_normal().text_sm().font_weight(FontWeight::SEMIBOLD).child(self.t(main)))
                        .when_some(*note, |column, note| column.child(div().min_w_0().w_full().whitespace_normal().text_xs().text_color(cx.theme().muted_foreground).child(self.t(note)))))
            }))
            .into_any_element()
    }
}
