/** Render conditional local sponsor media and copy as a Mixed-mode TSX page. */
export function renderNshSponsor(translations, profile) {
  const zh = translations['zh-CN'].sponsor;
  const en = translations['en-US'].sponsor;
  const images = [
    ...profile.sponsor.tiers.map((tier, index) => ({ path: tier.image, variable: `tierImage${index}` })),
    ...profile.sponsor.payments.map((payment, index) => ({ path: payment.image, variable: `paymentImage${index}` })),
    { path: profile.sponsor.background, variable: 'backgroundImage' },
  ];
  const imports = images.map(({ path, variable }) => `import ${variable} from ${JSON.stringify(`./assets/${path}`)};`).join('\n');
  const tiers = profile.sponsor.tiers.map((tier, index) => {
    const benefits = tier.benefits.map((item) => ({
      zh: [zh[item.mainKey.split('.').at(-1)], item.noteKey ? zh[item.noteKey.split('.').at(-1)] : null].filter(Boolean).join('\n'),
      en: [en[item.mainKey.split('.').at(-1)], item.noteKey ? en[item.noteKey.split('.').at(-1)] : null].filter(Boolean).join('\n'),
    }));
    return `{ image: tierImage${index}, name: { zh: ${JSON.stringify(zh[tier.nameKey.split('.').at(-1)])}, en: ${JSON.stringify(en[tier.nameKey.split('.').at(-1)])} }, alt: { zh: ${JSON.stringify(zh[tier.imageAltKey.split('.').at(-1)])}, en: ${JSON.stringify(en[tier.imageAltKey.split('.').at(-1)])} }, price: ${JSON.stringify(`${tier.currencyCode} ${tier.price}`)}, benefits: ${JSON.stringify(benefits)} }`;
  }).join(',\n  ');
  const payments = profile.sponsor.payments.map((payment, index) => `{ image: paymentImage${index}, alt: { zh: ${JSON.stringify(zh[payment.altKey.split('.').at(-1)])}, en: ${JSON.stringify(en[payment.altKey.split('.').at(-1)])} } }`).join(',\n  ');
  return `import { colorScheme, Image, Text, View } from "nsh";
import { type Language } from ${JSON.stringify('./translations')};
import { palette, tokens } from ${JSON.stringify('./tokens')};
${imports}

const copy = {
  zh: { title: ${JSON.stringify(zh.title)}, subtitle: ${JSON.stringify(zh.subtitle_no_service)}, message: ${JSON.stringify(zh.sponsor_message)}, payment: ${JSON.stringify(zh.payment_instructions)} },
  en: { title: ${JSON.stringify(en.title)}, subtitle: ${JSON.stringify(en.subtitle_no_service)}, message: ${JSON.stringify(en.sponsor_message)}, payment: ${JSON.stringify(en.payment_instructions)} },
};
const tiers = [
  ${tiers}
];
const payments = [
  ${payments}
];

function Benefit(props: { text: string }) {
  const colors = () => palette(colorScheme());
  const [heading, ...details] = props.text.split("\\n");
  return (
    <View style={{ gap: tokens.optionGap / 2 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: tokens.optionGap }}>
        <View style={{ width: tokens.optionGap, height: tokens.optionGap, borderRadius: tokens.optionGap / 2, marginTop: tokens.optionGap / 2, backgroundColor: colors().accent }} />
        <Text style={{ flex: 1, color: colors().foreground, fontSize: tokens.body, fontWeight: "600" }}>{heading}</Text>
      </View>
      {details.length > 0 && <Text style={{ marginLeft: tokens.optionGap * 2, color: colors().muted, fontSize: tokens.body }}>{details.join("\\n")}</Text>}
    </View>
  );
}

function TierCard(props: { tier: typeof tiers[number]; language: Language; width: number }) {
  const colors = () => palette(colorScheme());
  const tier = props.tier;
  return (
    <View style={{ width: props.width, padding: tokens.sponsorCardPadding, gap: tokens.contentGap, borderWidth: tokens.borderWidth, borderColor: colors().sidebarBorder, borderRadius: tokens.cardRadius, backgroundColor: colors().surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.contentGap }}>
        <Image src={tier.image} accessibilityLabel={tier.alt[props.language]} style={{ width: tokens.sponsorIllustration, height: tokens.sponsorIllustration, borderRadius: tokens.radius, objectFit: "contain" }} />
        <View style={{ flex: 1, minWidth: 0, gap: tokens.optionGap / 2 }}>
          <Text style={{ color: colors().accent, fontSize: tokens.body, fontWeight: "600" }}>{tier.name[props.language]}</Text>
          <Text style={{ color: colors().foreground, fontSize: tokens.sponsorPrice, fontWeight: "600" }}>{tier.price}</Text>
        </View>
      </View>
      <View style={{ gap: tokens.settingsGap }}>
        {tier.benefits.map((benefit) => <Benefit text={benefit[props.language]} />)}
      </View>
    </View>
  );
}

/** Bundled illustrations and payment codes remain informational; no tier starts a payment. */
export function SponsorPage(props: { language: Language; availableWidth: number }) {
  const colors = () => palette(colorScheme());
  const labels = () => copy[props.language];
  const width = () => Math.min(tokens.sponsorMaxWidth, props.availableWidth);
  const columns = () => width() >= tokens.sponsorCardMinWidth * 3 + tokens.contentGap * 2
    ? 3
    : width() >= tokens.sponsorCardMinWidth * 2 + tokens.contentGap ? 2 : 1;
  const cardWidth = () => Math.floor((width() - tokens.contentGap * (columns() - 1)) / columns());
  const paymentImageSize = () => Math.min(
    tokens.sponsorPaymentImage,
    Math.max(tokens.sponsorIllustration, (width() - tokens.sponsorCardPadding * 2 - tokens.contentGap) / 2),
  );
  const widePayment = () => width() >= tokens.sponsorCardMinWidth * 2 + tokens.sponsorPaymentImage + tokens.sponsorCardPadding * 2;
  return (
    <View style={{ width: width(), alignSelf: "center", gap: tokens.sectionGap }}>
      <View style={{ overflow: "hidden", padding: tokens.sponsorCardPadding, gap: tokens.optionGap, alignItems: "center", borderWidth: tokens.borderWidth, borderColor: colors().sidebarBorder, borderRadius: tokens.cardRadius, backgroundColor: colors().surface }}>
        <Image src={backgroundImage} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, objectFit: "cover", opacity: 0.12, pointerEvents: "none" }} />
        <Text style={{ color: colors().accent, fontSize: tokens.title, fontWeight: "600", textAlign: "center" }}>{labels().title}</Text>
        <Text style={{ color: colors().muted, fontSize: tokens.body, textAlign: "center" }}>{labels().subtitle}</Text>
        <Text style={{ color: colors().foreground, fontSize: tokens.body, textAlign: "center" }}>{labels().message}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: tokens.contentGap }}>
        {tiers.map((tier) => <TierCard tier={tier} language={props.language} width={cardWidth()} />)}
      </View>
      <View style={{ padding: tokens.sponsorCardPadding, flexDirection: widePayment() ? "row" : "column", gap: tokens.sectionGap, borderWidth: tokens.borderWidth, borderColor: colors().sidebarBorder, borderRadius: tokens.cardRadius, backgroundColor: colors().surface }}>
        <Text style={{ flex: widePayment() ? 1 : undefined, color: colors().foreground, fontSize: tokens.body, fontWeight: "600" }}>{labels().payment}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.contentGap }}>
          {payments.map((payment) => <View style={{ width: paymentImageSize(), gap: tokens.optionGap }}>
            <Text style={{ color: colors().muted, fontSize: tokens.body, textAlign: "center" }}>{payment.alt[props.language]}</Text>
            <Image src={payment.image} accessibilityLabel={payment.alt[props.language]} style={{ width: paymentImageSize(), height: paymentImageSize(), objectFit: "contain" }} />
          </View>)}
        </View>
      </View>
    </View>
  );
}
`;
}
