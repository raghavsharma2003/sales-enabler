---
id: pricing-plans
title: Pricing & Plans FAQs
description: "Frequently asked questions about Exotel pricing tiers, pay-as-you-go plans, enterprise pricing, and cost optimization."
sidebar_label: Pricing & Plans
sidebar_position: 3
---

# Pricing & Plans FAQs

Common questions about Exotel pricing models, plan tiers, usage-based billing, and how to choose the right plan for your business.

---

## What pricing models does Exotel offer?

Exotel offers two primary pricing models:

| Model | Best For | Billing |
|---|---|---|
| **Pay-as-you-go** | Startups and small businesses with variable usage | Charged per call minute and per SMS sent |
| **Bundled Plans** | Mid-size to large businesses with predictable volume | Fixed monthly fee with included minutes and SMS credits |

Enterprise customers with high-volume requirements can negotiate custom pricing with dedicated SLAs. Contact **hello@exotel.com** for enterprise quotes.

---

## How is call pricing calculated?

Call pricing depends on several factors:

- **Call direction** -- Inbound calls vs. outbound calls
- **Call type** -- Local, STD (long-distance), or international
- **Number type** -- Landline, mobile, or toll-free
- **Duration** -- Billed per second after a minimum billing duration (typically 1 second or per-pulse as per plan)

:::info
Outbound calls are billed from the moment the destination phone starts ringing (for connect-to-number calls) or from the moment the call is answered (depending on the API used). Check your specific plan terms for exact billing triggers.
:::

---

## What is included in the free trial?

The free trial provides limited credits to test Exotel's platform. Trial accounts include:

- A small number of outbound call minutes
- Limited SMS credits
- Access to a shared trial phone number
- Full API access with reduced rate limits
- Access to the Exotel Dashboard and reporting

Trial credits are non-refundable and expire after 15 days of account creation. No credit card is required to start the trial.

---

## How does SMS pricing work?

SMS pricing varies based on:

| Factor | Impact on Pricing |
|---|---|
| **Message type** | Transactional SMS vs. promotional SMS |
| **DLT route** | DLT-registered templates may have different rates |
| **Volume** | Higher volumes typically qualify for lower per-SMS rates |
| **Character count** | Messages exceeding 160 characters (GSM) or 70 characters (Unicode) are billed as multiple segments |

:::tip
Use GSM-7 encoding where possible to maximize the characters per SMS segment. Unicode messages (required for non-Latin scripts) have a lower character limit per segment.
:::

---

## Are there any setup fees?

Standard plans do not have setup fees. However, the following may incur one-time charges:

- **Dedicated virtual numbers** -- One-time activation fee plus monthly rental
- **Toll-free numbers** -- Higher activation fees and per-minute inbound charges
- **Custom IVR development** -- If Exotel's professional services team builds your call flow
- **Enterprise onboarding** -- Custom integrations and dedicated support setup

---

## How do I estimate my monthly costs?

To estimate your monthly Exotel costs, consider:

1. **Call volume** -- Total outbound and inbound call minutes per month
2. **SMS volume** -- Total transactional and promotional SMS per month
3. **Virtual numbers** -- Number of active virtual numbers (monthly rental per number)
4. **WhatsApp messages** -- Volume and type (session vs. template messages)
5. **Contact center agents** -- Number of concurrent agent licenses

Contact Exotel sales or use the pricing calculator on [exotel.com](https://exotel.com/pricing) for a detailed estimate tailored to your usage patterns.

---

## Can I change my plan mid-cycle?

Yes. You can upgrade your plan at any time from **Settings > Billing** in the Exotel Dashboard. Plan changes work as follows:

- **Upgrades** -- Take effect immediately. You are charged the prorated difference for the remainder of the billing cycle.
- **Downgrades** -- Take effect at the start of the next billing cycle. You retain your current plan benefits until the cycle ends.

:::caution
Downgrading may result in loss of features or capacity limits. Review the target plan's feature set before downgrading to avoid service disruptions.
:::

---

## What happens when I run out of credits?

When your account balance reaches zero:

- **Pay-as-you-go accounts** -- All outbound calls and SMS are suspended until you recharge. Inbound calls to your virtual numbers continue to work for a grace period.
- **Bundled plans** -- Once your included minutes or SMS are exhausted, additional usage is billed at overage rates defined in your plan.

You can configure low-balance alerts in the Exotel Dashboard under **Settings > Notifications** to receive email notifications when your balance drops below a specified threshold.

---

## Does Exotel offer volume discounts?

Yes. Volume-based discounts are available for:

- High call minute usage (typically above 50,000 minutes/month)
- Bulk SMS (above 100,000 SMS/month)
- WhatsApp message volume
- Multi-year commitments

Contact your account manager or **hello@exotel.com** to discuss volume pricing for your expected usage.

---

## Are taxes included in the listed prices?

No. All prices listed on the Exotel website and dashboard are exclusive of applicable taxes. For Indian customers, **18% GST** is added to all invoices. The tax breakdown is itemized on every invoice.

---

## Related Resources

- [Account Setup](/docs/faqs/account-setup) -- Account creation and KYC
- [SMS API Overview](/docs/sms-api/overview) -- SMS capabilities and rate limits
- [Voice v1 Overview](/docs/voice-v1/overview) -- Voice API capabilities
