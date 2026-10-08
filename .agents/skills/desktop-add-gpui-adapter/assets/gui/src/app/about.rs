//! 关于页仅显示当前应用身份与真实本地状态；初始化没有远程更新或发布记录。

use super::Shell;
use gpui_kit::{AnyElement, Context, FontWeight, IntoElement, component::{ActiveTheme, button::Button}, div, img, prelude::*, px};

impl Shell {
    /// 关于信息、检查状态与更新日志按钮都在实际页面内接线。
    pub(super) fn about_page(&self, cx: &mut Context<Self>) -> AnyElement {
        div().w_full().flex().flex_col().gap_6()
            .child(self.card("about.application", "about.description", cx)
                .child(div().flex().items_center().gap_5()
                    .child(img(crate::assets::LOGO).size(px(72.)))
                    .child(div().flex_1().min_w_0().flex().flex_col().gap_2()
                        .child(div().w_full().min_w_0().whitespace_normal().text_size(px(26.)).font_weight(FontWeight::BOLD).child(self.name()))
                        .child(self.version())))
                .child(div().w_full().min_w_0().whitespace_normal().text_sm().text_color(cx.theme().muted_foreground).child(format!("{}: @@OWNER@@", self.t("about.author"))))
                .child(div().flex().gap_3().flex_wrap()
                    .child(Button::new("about-update-check").outline().label(self.t("about.check_updates"))
                        .on_click(cx.listener(|this, _, _, cx| { this.show_update_status = true; cx.notify(); })))
                    .child(Button::new("about-release-notes").outline().label(self.t("about.release_notes"))
                        .on_click(cx.listener(|this, _, _, cx| { this.show_release_notes = !this.show_release_notes; cx.notify(); }))))
                .when(self.show_update_status, |card| card.child(div().w_full().min_w_0().whitespace_normal().text_sm().child(self.t("about.updater_unavailable")))))
            .when(self.show_release_notes, |page| page.child(self.card("about.release_notes", "about.no_releases", cx)))
            .child(self.card("about.contact_author_title", "about.support_thanks", cx)
                .child("QQ @@BRAND_CONTACT@@"))
            .child(self.card("about.local_first", "about.local_first_detail", cx))
            .child(self.card("about.disclaimer_title", "about.disclaimer_1", cx)
                .child(div().w_full().min_w_0().whitespace_normal().text_sm().child(self.t("about.disclaimer_2")))
                .child(div().w_full().min_w_0().whitespace_normal().text_sm().child(self.t("about.disclaimer_3"))))
            .into_any_element()
    }
}
