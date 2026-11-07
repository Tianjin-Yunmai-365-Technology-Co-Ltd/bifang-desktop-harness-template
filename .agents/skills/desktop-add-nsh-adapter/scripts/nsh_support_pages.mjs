/** Render conditional local sponsor media and copy as a Mixed-mode TSX page. */
export function renderNshSponsor(translations, profile) {
  const zh = translations['zh-CN'].sponsor;
  const en = translations['en-US'].sponsor;
  const images = [
    ...profile.sponsor.tiers.map((tier, index) => ({ path: tier.image, variable: `tierImage${index}` })),
    ...profile.sponsor.payments.map((payment, index) => ({ path: payment.image, variable: `paymentImage${index}` })),
  ];
  const imports = images.map(({ path, variable }) => `import ${variable} from ${JSON.stringify(`./assets/${path}`)};`).join('\n');
  const tiers = profile.sponsor.tiers.map((tier, index) => {
    const benefits = tier.benefits.map((item) => ({
      zh: [zh[item.mainKey.split('.').at(-1)], item.noteKey ? zh[item.noteKey.split('.').at(-1)] : null].filter(Boolean).join('\n'),
      en: [en[item.mainKey.split('.').at(-1)], item.noteKey ? en[item.noteKey.split('.').at(-1)] : null].filter(Boolean).join('\n'),
    }));
    return `{ image: tierImage${index}, name: { zh: ${JSON.stringify(zh[tier.nameKey.split('.').at(-1)])}, en: ${JSON.stringify(en[tier.nameKey.split('.').at(-1)])} }, alt: { zh: ${JSON.stringify(zh[tier.imageAltKey.split('.').at(-1)])}, en: ${JSON.stringify(en[tier.imageAltKey.split('.').at(-1)])} }, price: ${JSON.stringify(`CNY ${tier.price}`)}, benefits: ${JSON.stringify(benefits)} }`;
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

/** Only local bundled images are shown; choosing a tier never starts a payment. */
export function SponsorPage(props: { language: Language }) {
  const colors = palette(colorScheme());
  const labels = copy[props.language];
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.foreground, fontSize: tokens.title }}>{labels.title}</Text>
      <Text style={{ color: colors.muted }}>{labels.subtitle}</Text>
      <Text style={{ color: colors.foreground }}>{labels.message}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {tiers.map((tier) =>
          <View style={{ width: 240, padding: 14, gap: 8, borderRadius: tokens.radius, backgroundColor: colors.surface }}>
            <Image src={tier.image} accessibilityLabel={tier.alt[props.language]} style={{ width: 96, height: 96 }} />
            <Text style={{ color: colors.foreground }}>{tier.name[props.language]}</Text>
            <Text style={{ color: colors.muted }}>{tier.price}</Text>
            {tier.benefits.map((benefit) => <Text style={{ color: colors.foreground }}>{benefit[props.language]}</Text>)}
          </View>
        )}
      </View>
      <Text style={{ color: colors.foreground }}>{labels.payment}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {payments.map((payment) =>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted }}>{payment.alt[props.language]}</Text>
            <Image src={payment.image} accessibilityLabel={payment.alt[props.language]} style={{ width: 128, height: 128 }} />
          </View>
        )}
      </View>
    </View>
  );
}
`;
}
