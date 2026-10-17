/* VP listener panel (H5/H6). Static page: it loads only its own files and never calls a network service.
 * The schedule for each listener comes from plans/<panel>.js (built by build_plan.py); this file only runs it.
 * Answers stay on the phone (localStorage) until the listener sends or downloads them.
 * URL: index.html?panel=bihar|outgroup|tamilnadu|maharashtra&pid=B017&lang=hi|en|ta|mr[&mode=field|pilot|kiosk|test][&retest=1]
 * Coordinator view (all sessions saved on this device): index.html?coordinator=1
 */
'use strict';
(function () {
  // ===== Owner configuration: fill these in before the pilot (protocol 7). The page refuses to start without them. =====
  const CONFIG = {
    owner: '[STUDY OWNER: legal name of the business running the study]',
    contact: '[CONTACT: phone or email for questions, withdrawal and complaints]',
    amount: 250,             // INR per completed session (protocol 8)
    retention_months: 12,
  };

  const APP_VERSION = '1.0.0';
  const SCHEMA = 'vpl-answers/1';
  const CONSENT_VERSION = 'c2-2026-10-17';
  const PANELS = ['bihar', 'outgroup', 'tamilnadu', 'maharashtra'];
  const LANGS = { en: 'English', hi: 'हिंदी', ta: 'தமிழ்', mr: 'मराठी' };

  // ===== Text. hi/ta/mr are drafts that need native review and back-translation before fielding (protocol 7.3). =====
  const I18N = {
    en: {
      title: 'Listening study',
      welcome_h: 'Help us test phone callers',
      welcome_p: ['You will hear short recordings of phone calls from businesses and answer questions about them. It takes about 25 minutes.',
        'Please sit somewhere quiet. Use earphones if you have them.'],
      start: 'Start',
      resume_q: 'You have an unfinished session on this phone. Continue where you left off?',
      resume_yes: 'Continue', resume_no: 'Start again',
      consent_h: 'Before you start',
      consent: [
        'This is a research study run by {owner}. We want to learn how people feel about different phone callers.',
        'What you will do: listen to about 30 short recordings (10 to 15 seconds each) and answer questions. It takes about 25 minutes.',
        'What we record: your answers, age group, gender, home state and district, the state you live in now, the languages you speak, your education level, and what kind of phone and earphones you use. We do not record your name, phone number or voice with your answers. Your coordinator sees your phone number and UPI details when you send answers or get paid; they keep these separately from the answers, use them only to pay you, and delete them after payment.',
        'Payment: ₹{amount} by UPI after you finish.',
        'Your choice: taking part is voluntary. You can stop at any time by closing this page; if you stop before the end, your answers are not used. To withdraw answers you have already sent, contact {contact} with your participant code {pid} within {months} months and we will delete them.',
        'We keep the answers for {months} months after the study ends, then delete them. Results are published only as group totals. For questions or complaints about your data, contact {contact}.',
        'Some voices you will hear are computer-generated, and the shops and companies in the calls are made up. There are no right or wrong answers, except a few questions that check you are listening.'],
      consent_yes: 'I am 18 or older and I agree to take part',
      consent_no: 'I do not want to take part',
      declined: 'Thank you. Nothing has been recorded. You can close this page.',
      screen_h: 'About you',
      screen_p: 'We do not ask for your name or phone number.',
      q_age: 'Your age', q_gender: 'Gender', q_home_state: 'Your home state (where your family is from)',
      q_home_district: 'Home district', q_cur_state: 'Where do you live now?', q_place: 'The place where you live now is a',
      q_mt: 'Your mother tongue', q_home_lang: 'The language you mostly speak at home',
      q_other_langs: 'Other languages you understand well (tick all that apply)', q_edu: 'Education',
      q_phone: 'Your phone', q_device: 'How are you listening?',
      q_work: 'In the last 12 months, have you worked in telecalling, a call centre or BPO, or for a company that makes AI or voice software?',
      q_know: 'Do you personally know anyone who runs this study?',
      q_before: 'Have you taken part in this listening study before, including a trial round?',
      yes: 'Yes', no: 'No', next: 'Next', required: 'Please answer every question.',
      screened_out: 'Thank you for your time. This study is looking for people with a particular background, so we will stop here. Nothing else is recorded.',
      check_h: 'Sound check',
      check_p: 'Put on earphones if you have them, or hold the phone to your ear. Set a comfortable volume. Tap the button and count the beeps.',
      check_play: 'Play beeps', check_q: 'How many beeps did you hear?',
      check_retry: 'That was not right. Check the volume and try again.',
      check_fail: 'We could not confirm that sound works on this phone. Please try again later, with earphones or another phone. Thank you.',
      introC_h: 'Part 1: a real person or a computer?',
      introC_p: 'Some of the next calls are spoken by a real person and some by a computer voice. Listen to each call once and tell us what you think.',
      introB_h: 'Part {part}: single calls',
      introB_p: 'You will hear {n} short calls. Imagine each caller is calling you. Each call plays only once, so please listen carefully, then answer the questions.',
      introA_h: 'Part {part}: pairs of calls',
      introA_p: 'Now you will hear two callers, A and B, saying the same thing. Listen to both, then choose the one you would rather keep talking to. If you really cannot choose, tap “No difference”.',
      begin: 'Begin',
      call_n: 'Call {n} of {N}', pair_n: 'Pair {n} of {N}',
      play_call: 'Play the call', playing: 'Playing…', played: 'Played',
      audio_stuck: 'Sound stopped or did not play? Play again',
      comp_h: 'What did the caller say?',
      q_nat: 'How natural did the voice sound?',
      nat: ['Very unnatural', 'Unnatural', 'Somewhat natural', 'Natural', 'Completely natural'],
      q_trust: 'I would believe what this caller says.',
      q_patr: 'This caller was talking down to me, or making fun of how people here speak.',
      q_fit: 'This caller sounds like someone from my area.',
      agree_lo: 'Strongly disagree', agree_hi: 'Strongly agree',
      q_cont: 'Would you continue this call?',
      cont: ['Definitely not', 'Probably not', 'Not sure', 'Probably yes', 'Definitely yes'],
      attn: 'This row checks that you are reading: please tap 2 on this row.',
      play_both: 'Play A, then B', replay_a: 'Play A again', replay_b: 'Play B again',
      caller_a: 'Caller A', caller_b: 'Caller B',
      q_pref: 'Which caller would you rather keep talking to?',
      pref: { A2: 'A, clearly', A1: 'A, slightly', '0': 'No difference', B1: 'B, slightly', B2: 'B, clearly' },
      q_hai: 'Was this a real person or a computer voice?', hai_h: 'A real person', hai_c: 'A computer voice',
      q_conf: 'How sure are you?', conf: ['Guessing', 'Fairly sure', 'Very sure'],
      close_h: 'Last question', close_q: 'What, if anything, felt off about these callers? (optional)',
      close_ph: 'Type here, in any language', finish: 'Finish',
      done_h: 'Thank you!',
      debrief: 'What this study is about: we are testing whether people prefer phone callers who speak their own language or local way of speaking, and whether that sounds respectful or not. {voices} Your answers are used only for this research.',
      voices_tts: 'Every voice you heard was computer-generated.',
      voices_mixed: 'Some calls in Part 1 were real people reading a script; every other voice was computer-generated.',
      send_h: 'Send your answers',
      send_p: 'Your answers are saved only on this phone until you send them. Please send them to your coordinator now.',
      send_share: 'Send (WhatsApp or email)', send_download: 'Download answer file', send_csv: 'Download table (CSV)',
      send_copy: 'Copy answer code', copied: 'Copied. Paste it into WhatsApp to your coordinator.',
      copy_fail: 'Could not copy automatically. Select the code below and copy it.',
      completion: 'Completion code: {code}. Tell this to your coordinator.',
      payment: 'Your coordinator will send ₹{amount} by UPI after your answers arrive.',
      not_configured: 'This study page is not set up yet (owner, contact or payment missing). Please tell your coordinator.',
      bad_link: 'This link is incomplete or wrong. Please ask your coordinator for a new link.',
      pilot_banner: 'Trial round: these answers are not used in the main results.',
      test_banner: 'Test mode',
      retest_p: 'Welcome back. This short session repeats the pairs of calls only (about 8 minutes).',
      coordinator_h: 'Sessions saved on this device', export_json: 'Export all (JSON)', export_csv: 'Export all (CSV)',
      clear: 'Delete saved sessions from this device', clear_confirm: 'Delete every saved session from this device? Export first.',
      none_saved: 'No sessions saved on this device.',
      storage_warn: 'This browser is not saving progress. Do not close the page until you have sent your answers.',
    },
    hi: {
      title: 'सुनने का अध्ययन',
      welcome_h: 'फ़ोन कॉल करने वालों को परखने में हमारी मदद करें',
      welcome_p: ['आप कंपनियों की कुछ छोटी फ़ोन कॉल रिकॉर्डिंग सुनेंगे और उनके बारे में सवालों के जवाब देंगे। इसमें लगभग 25 मिनट लगेंगे।',
        'कृपया किसी शांत जगह पर बैठें। अगर आपके पास ईयरफ़ोन हैं तो उनका इस्तेमाल करें।'],
      start: 'शुरू करें',
      resume_q: 'इस फ़ोन पर आपका एक अधूरा सत्र है। जहाँ छोड़ा था वहीं से आगे बढ़ें?',
      resume_yes: 'आगे बढ़ें', resume_no: 'फिर से शुरू करें',
      consent_h: 'शुरू करने से पहले',
      consent: [
        'यह {owner} द्वारा किया जा रहा एक शोध अध्ययन है। हम जानना चाहते हैं कि लोगों को अलग-अलग फ़ोन कॉल करने वाले कैसे लगते हैं।',
        'आपको क्या करना है: लगभग 30 छोटी रिकॉर्डिंग (हर एक 10 से 15 सेकंड की) सुनकर सवालों के जवाब देने हैं। इसमें लगभग 25 मिनट लगेंगे।',
        'हम क्या दर्ज करते हैं: आपके जवाब, उम्र का समूह, लिंग, आपका गृह राज्य और ज़िला, आप अभी किस राज्य में रहते हैं, आप कौन-सी भाषाएँ बोलते हैं, आपकी पढ़ाई, और आप कौन-सा फ़ोन और ईयरफ़ोन इस्तेमाल करते हैं। हम आपके जवाबों के साथ आपका नाम, फ़ोन नंबर या आवाज़ दर्ज नहीं करते। जवाब भेजते या भुगतान लेते समय आपके कोऑर्डिनेटर आपका फ़ोन नंबर और UPI जानकारी देखते हैं; वे इन्हें जवाबों से अलग रखते हैं, सिर्फ़ भुगतान के लिए इस्तेमाल करते हैं, और भुगतान के बाद मिटा देते हैं।',
        'भुगतान: पूरा करने के बाद UPI से ₹{amount}।',
        'आपकी मर्ज़ी: भाग लेना आपकी इच्छा पर है। आप यह पेज बंद करके कभी भी रुक सकते हैं; अगर आप बीच में रुकते हैं तो आपके जवाब इस्तेमाल नहीं होंगे। भेजे जा चुके जवाब वापस लेने के लिए {months} महीनों के अंदर अपने प्रतिभागी कोड {pid} के साथ {contact} से संपर्क करें, हम उन्हें मिटा देंगे।',
        'अध्ययन खत्म होने के बाद हम जवाब {months} महीने तक रखते हैं, फिर मिटा देते हैं। नतीजे सिर्फ़ समूह के कुल आँकड़ों के रूप में छपते हैं। अपने डेटा के बारे में सवाल या शिकायत के लिए {contact} से संपर्क करें।',
        'आप जो कुछ आवाज़ें सुनेंगे वे कंप्यूटर से बनी हैं, और कॉल में आने वाली दुकानें और कंपनियाँ काल्पनिक हैं। कोई जवाब सही या गलत नहीं है, सिवाय कुछ सवालों के जो यह जाँचते हैं कि आप ध्यान से सुन रहे हैं।'],
      consent_yes: 'मेरी उम्र 18 साल या उससे ज़्यादा है और मैं भाग लेने के लिए सहमत हूँ',
      consent_no: 'मैं भाग नहीं लेना चाहता/चाहती',
      declined: 'धन्यवाद। कुछ भी दर्ज नहीं हुआ है। आप यह पेज बंद कर सकते हैं।',
      screen_h: 'आपके बारे में',
      screen_p: 'हम आपका नाम या फ़ोन नंबर नहीं पूछते।',
      q_age: 'आपकी उम्र', q_gender: 'लिंग', q_home_state: 'आपका गृह राज्य (जहाँ से आपका परिवार है)',
      q_home_district: 'गृह ज़िला', q_cur_state: 'आप अभी कहाँ रहते हैं?', q_place: 'आप अभी जहाँ रहते हैं वह है',
      q_mt: 'आपकी मातृभाषा', q_home_lang: 'घर पर आप ज़्यादातर कौन-सी भाषा बोलते हैं',
      q_other_langs: 'और कौन-सी भाषाएँ आप अच्छी तरह समझते हैं (जितनी लागू हों सब चुनें)', q_edu: 'पढ़ाई',
      q_phone: 'आपका फ़ोन', q_device: 'आप कैसे सुन रहे हैं?',
      q_work: 'पिछले 12 महीनों में क्या आपने टेलीकॉलिंग, कॉल सेंटर या BPO में, या AI या वॉइस सॉफ़्टवेयर बनाने वाली किसी कंपनी में काम किया है?',
      q_know: 'क्या आप यह अध्ययन चलाने वाले किसी व्यक्ति को निजी तौर पर जानते हैं?',
      q_before: 'क्या आपने पहले कभी इस सुनने के अध्ययन में भाग लिया है, ट्रायल राउंड समेत?',
      yes: 'हाँ', no: 'नहीं', next: 'आगे', required: 'कृपया हर सवाल का जवाब दें।',
      screened_out: 'आपके समय के लिए धन्यवाद। यह अध्ययन एक खास पृष्ठभूमि के लोगों को ढूँढ रहा है, इसलिए हम यहीं रुकेंगे। और कुछ दर्ज नहीं किया गया है।',
      check_h: 'आवाज़ की जाँच',
      check_p: 'अगर ईयरफ़ोन हैं तो लगा लें, नहीं तो फ़ोन कान पर लगाएँ। आवाज़ आरामदायक स्तर पर रखें। बटन दबाएँ और बीप गिनें।',
      check_play: 'बीप चलाएँ', check_q: 'आपने कितनी बीप सुनीं?',
      check_retry: 'यह सही नहीं था। आवाज़ का स्तर देखें और फिर से कोशिश करें।',
      check_fail: 'हम पक्का नहीं कर पाए कि इस फ़ोन पर आवाज़ ठीक चल रही है। कृपया बाद में ईयरफ़ोन या किसी दूसरे फ़ोन के साथ फिर कोशिश करें। धन्यवाद।',
      introC_h: 'भाग 1: असली इंसान या कंप्यूटर?',
      introC_p: 'आगे की कुछ कॉल किसी असली इंसान ने बोली हैं और कुछ कंप्यूटर की आवाज़ ने। हर कॉल एक बार सुनें और बताएँ आपको क्या लगता है।',
      introB_h: 'भाग {part}: एक-एक कॉल',
      introB_p: 'आप {n} छोटी कॉल सुनेंगे। सोचिए कि हर कॉल करने वाला आपको फ़ोन कर रहा है। हर कॉल सिर्फ़ एक बार चलेगी, इसलिए ध्यान से सुनें, फिर सवालों के जवाब दें।',
      introA_h: 'भाग {part}: कॉल के जोड़े',
      introA_p: 'अब आप दो कॉल करने वालों, A और B, को एक ही बात कहते हुए सुनेंगे। दोनों को सुनें, फिर चुनें कि आप किससे बात जारी रखना पसंद करेंगे। अगर सच में नहीं चुन पा रहे, तो “कोई फ़र्क नहीं” दबाएँ।',
      begin: 'शुरू करें',
      call_n: 'कॉल {n} / {N}', pair_n: 'जोड़ा {n} / {N}',
      play_call: 'कॉल चलाएँ', playing: 'चल रही है…', played: 'चल चुकी',
      audio_stuck: 'आवाज़ रुक गई या नहीं चली? फिर से चलाएँ',
      comp_h: 'कॉल करने वाले ने क्या कहा?',
      q_nat: 'आवाज़ कितनी स्वाभाविक लगी?',
      nat: ['बिल्कुल अस्वाभाविक', 'अस्वाभाविक', 'कुछ हद तक स्वाभाविक', 'स्वाभाविक', 'पूरी तरह स्वाभाविक'],
      q_trust: 'यह कॉल करने वाला जो कहता है, मैं उस पर भरोसा करूँगा/करूँगी।',
      q_patr: 'यह कॉल करने वाला मुझसे नीचा दिखाकर बात कर रहा था, या यहाँ के लोगों के बोलने का मज़ाक उड़ा रहा था।',
      q_fit: 'यह कॉल करने वाला मेरे इलाके का कोई व्यक्ति लगता है।',
      agree_lo: 'बिल्कुल असहमत', agree_hi: 'पूरी तरह सहमत',
      q_cont: 'क्या आप यह कॉल जारी रखेंगे?',
      cont: ['बिल्कुल नहीं', 'शायद नहीं', 'पक्का नहीं', 'शायद हाँ', 'बिल्कुल हाँ'],
      attn: 'यह पंक्ति जाँचती है कि आप पढ़ रहे हैं: कृपया इस पंक्ति में 2 दबाएँ।',
      play_both: 'A चलाएँ, फिर B', replay_a: 'A फिर से चलाएँ', replay_b: 'B फिर से चलाएँ',
      caller_a: 'कॉलर A', caller_b: 'कॉलर B',
      q_pref: 'आप किस कॉल करने वाले से बात जारी रखना पसंद करेंगे?',
      pref: { A2: 'A, साफ़ तौर पर', A1: 'A, थोड़ा', '0': 'कोई फ़र्क नहीं', B1: 'B, थोड़ा', B2: 'B, साफ़ तौर पर' },
      q_hai: 'यह असली इंसान था या कंप्यूटर की आवाज़?', hai_h: 'असली इंसान', hai_c: 'कंप्यूटर की आवाज़',
      q_conf: 'आप कितने पक्के हैं?', conf: ['अंदाज़ा है', 'काफ़ी पक्का', 'पूरी तरह पक्का'],
      close_h: 'आखिरी सवाल', close_q: 'इन कॉल करने वालों में आपको क्या अटपटा लगा, अगर कुछ लगा हो? (वैकल्पिक)',
      close_ph: 'यहाँ किसी भी भाषा में लिखें', finish: 'पूरा करें',
      done_h: 'धन्यवाद!',
      debrief: 'यह अध्ययन किस बारे में है: हम यह जाँच रहे हैं कि क्या लोग ऐसे कॉल करने वालों को पसंद करते हैं जो उनकी अपनी भाषा या इलाके के अंदाज़ में बोलते हैं, और क्या यह सम्मानजनक लगता है या नहीं। {voices} आपके जवाब सिर्फ़ इस शोध के लिए इस्तेमाल होंगे।',
      voices_tts: 'आपने जो भी आवाज़ें सुनीं, वे सब कंप्यूटर से बनी थीं।',
      voices_mixed: 'भाग 1 की कुछ कॉल असली लोगों ने स्क्रिप्ट पढ़कर बोली थीं; बाकी सभी आवाज़ें कंप्यूटर से बनी थीं।',
      send_h: 'अपने जवाब भेजें',
      send_p: 'जब तक आप भेजते नहीं, आपके जवाब सिर्फ़ इसी फ़ोन पर सेव हैं। कृपया अभी अपने कोऑर्डिनेटर को भेजें।',
      send_share: 'भेजें (WhatsApp या ईमेल)', send_download: 'जवाब की फ़ाइल डाउनलोड करें', send_csv: 'टेबल डाउनलोड करें (CSV)',
      send_copy: 'जवाब कोड कॉपी करें', copied: 'कॉपी हो गया। इसे WhatsApp पर अपने कोऑर्डिनेटर को पेस्ट करें।',
      copy_fail: 'अपने आप कॉपी नहीं हो सका। नीचे दिया कोड चुनकर कॉपी करें।',
      completion: 'पूरा होने का कोड: {code}। यह अपने कोऑर्डिनेटर को बताएँ।',
      payment: 'आपके जवाब पहुँचने के बाद आपके कोऑर्डिनेटर UPI से ₹{amount} भेजेंगे।',
      not_configured: 'यह अध्ययन पेज अभी तैयार नहीं है (मालिक, संपर्क या भुगतान की जानकारी नहीं है)। कृपया अपने कोऑर्डिनेटर को बताएँ।',
      bad_link: 'यह लिंक अधूरा या गलत है। कृपया अपने कोऑर्डिनेटर से नया लिंक माँगें।',
      pilot_banner: 'ट्रायल राउंड: ये जवाब मुख्य नतीजों में इस्तेमाल नहीं होंगे।',
      test_banner: 'टेस्ट मोड',
      retest_p: 'आपका फिर से स्वागत है। इस छोटे सत्र में सिर्फ़ कॉल के जोड़े दोहराए जाएँगे (लगभग 8 मिनट)।',
      storage_warn: 'यह ब्राउज़र प्रगति सेव नहीं कर रहा है। जवाब भेजने से पहले पेज बंद न करें।',
    },
    ta: {
      title: 'கேட்கும் ஆய்வு',
      welcome_h: 'தொலைபேசி அழைப்பாளர்களைச் சோதிக்க எங்களுக்கு உதவுங்கள்',
      welcome_p: ['நிறுவனங்களின் சில சிறிய தொலைபேசி அழைப்புப் பதிவுகளைக் கேட்டு, அவற்றைப் பற்றிய கேள்விகளுக்குப் பதில் சொல்வீர்கள். இதற்குச் சுமார் 25 நிமிடங்கள் ஆகும்.',
        'அமைதியான இடத்தில் உட்காருங்கள். இயர்போன் இருந்தால் பயன்படுத்துங்கள்.'],
      start: 'தொடங்கு',
      resume_q: 'இந்த போனில் முடிக்காத ஒரு அமர்வு உள்ளது. விட்ட இடத்திலிருந்து தொடரலாமா?',
      resume_yes: 'தொடரவும்', resume_no: 'மீண்டும் தொடங்கு',
      consent_h: 'தொடங்கும் முன்',
      consent: [
        'இது {owner} நடத்தும் ஒரு ஆய்வு. வெவ்வேறு தொலைபேசி அழைப்பாளர்களைப் பற்றி மக்கள் எப்படி உணர்கிறார்கள் என்று அறிய விரும்புகிறோம்.',
        'நீங்கள் செய்ய வேண்டியது: சுமார் 30 சிறிய பதிவுகளைக் (ஒவ்வொன்றும் 10 முதல் 15 வினாடிகள்) கேட்டு கேள்விகளுக்குப் பதில் சொல்வது. இதற்குச் சுமார் 25 நிமிடங்கள் ஆகும்.',
        'நாங்கள் பதிவு செய்வது: உங்கள் பதில்கள், வயதுப் பிரிவு, பாலினம், சொந்த மாநிலம் மற்றும் மாவட்டம், இப்போது வசிக்கும் மாநிலம், நீங்கள் பேசும் மொழிகள், கல்வி நிலை, நீங்கள் பயன்படுத்தும் போன் மற்றும் இயர்போன் வகை. உங்கள் பதில்களுடன் உங்கள் பெயர், தொலைபேசி எண் அல்லது குரலை நாங்கள் பதிவு செய்வதில்லை. நீங்கள் பதில்களை அனுப்பும்போதும் பணம் பெறும்போதும் உங்கள் ஒருங்கிணைப்பாளர் உங்கள் தொலைபேசி எண்ணையும் UPI விவரங்களையும் பார்ப்பார்; அவற்றைப் பதில்களிலிருந்து தனியாக வைத்து, பணம் அனுப்ப மட்டும் பயன்படுத்தி, பணம் அனுப்பிய பின் அழித்துவிடுவார்.',
        'கட்டணம்: முடித்த பிறகு UPI மூலம் ₹{amount}.',
        'உங்கள் விருப்பம்: பங்கேற்பது உங்கள் விருப்பம். இந்தப் பக்கத்தை மூடி எப்போது வேண்டுமானாலும் நிறுத்தலாம்; இடையில் நிறுத்தினால் உங்கள் பதில்கள் பயன்படுத்தப்படாது. ஏற்கனவே அனுப்பிய பதில்களைத் திரும்பப் பெற, {months} மாதங்களுக்குள் உங்கள் பங்கேற்பாளர் குறியீடு {pid} உடன் {contact} ஐத் தொடர்பு கொள்ளுங்கள்; நாங்கள் அவற்றை அழித்துவிடுவோம்.',
        'ஆய்வு முடிந்த பிறகு பதில்களை {months} மாதங்கள் வைத்திருந்து, பின் அழித்துவிடுவோம். முடிவுகள் குழு மொத்தங்களாக மட்டுமே வெளியிடப்படும். உங்கள் தரவு பற்றிய கேள்விகள் அல்லது புகார்களுக்கு {contact} ஐத் தொடர்பு கொள்ளுங்கள்.',
        'நீங்கள் கேட்கும் சில குரல்கள் கணினியால் உருவாக்கப்பட்டவை, அழைப்புகளில் வரும் கடைகளும் நிறுவனங்களும் கற்பனையானவை. சரி அல்லது தவறு என்ற பதில் எதுவும் இல்லை, நீங்கள் கவனமாகக் கேட்கிறீர்களா என்று சோதிக்கும் சில கேள்விகளைத் தவிர.'],
      consent_yes: 'எனக்கு 18 வயது அல்லது அதற்கு மேல், பங்கேற்க ஒப்புக்கொள்கிறேன்',
      consent_no: 'நான் பங்கேற்க விரும்பவில்லை',
      declined: 'நன்றி. எதுவும் பதிவு செய்யப்படவில்லை. இந்தப் பக்கத்தை மூடலாம்.',
      screen_h: 'உங்களைப் பற்றி',
      screen_p: 'உங்கள் பெயரையோ தொலைபேசி எண்ணையோ நாங்கள் கேட்பதில்லை.',
      q_age: 'உங்கள் வயது', q_gender: 'பாலினம்', q_home_state: 'உங்கள் சொந்த மாநிலம் (உங்கள் குடும்பம் உள்ள இடம்)',
      q_home_district: 'சொந்த மாவட்டம்', q_cur_state: 'இப்போது எங்கே வசிக்கிறீர்கள்?', q_place: 'நீங்கள் இப்போது வசிக்கும் இடம்',
      q_mt: 'உங்கள் தாய்மொழி', q_home_lang: 'வீட்டில் பெரும்பாலும் பேசும் மொழி',
      q_other_langs: 'நன்றாகப் புரியும் பிற மொழிகள் (பொருந்தும் அனைத்தையும் தேர்ந்தெடுக்கவும்)', q_edu: 'கல்வி',
      q_phone: 'உங்கள் போன்', q_device: 'எப்படிக் கேட்கிறீர்கள்?',
      q_work: 'கடந்த 12 மாதங்களில் டெலிகாலிங், கால் சென்டர் அல்லது BPO-வில், அல்லது AI அல்லது குரல் மென்பொருள் தயாரிக்கும் நிறுவனத்தில் வேலை செய்திருக்கிறீர்களா?',
      q_know: 'இந்த ஆய்வை நடத்துபவர்களில் யாரையாவது உங்களுக்குத் தனிப்பட்ட முறையில் தெரியுமா?',
      q_before: 'சோதனைச் சுற்று உட்பட, இதற்கு முன் இந்தக் கேட்கும் ஆய்வில் பங்கேற்றிருக்கிறீர்களா?',
      yes: 'ஆம்', no: 'இல்லை', next: 'அடுத்து', required: 'தயவுசெய்து எல்லாக் கேள்விகளுக்கும் பதில் சொல்லுங்கள்.',
      screened_out: 'உங்கள் நேரத்திற்கு நன்றி. இந்த ஆய்வு ஒரு குறிப்பிட்ட பின்னணி உள்ளவர்களைத் தேடுகிறது, எனவே இங்கே நிறுத்துகிறோம். வேறு எதுவும் பதிவு செய்யப்படவில்லை.',
      check_h: 'ஒலிச் சோதனை',
      check_p: 'இயர்போன் இருந்தால் அணியுங்கள், இல்லையென்றால் போனைக் காதில் வையுங்கள். வசதியான ஒலி அளவை வையுங்கள். பொத்தானை அழுத்தி பீப் ஒலிகளை எண்ணுங்கள்.',
      check_play: 'பீப் ஒலிகளை இயக்கு', check_q: 'எத்தனை பீப் ஒலிகள் கேட்டன?',
      check_retry: 'அது சரியில்லை. ஒலி அளவைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
      check_fail: 'இந்த போனில் ஒலி வேலை செய்கிறது என்று உறுதிப்படுத்த முடியவில்லை. பிறகு இயர்போனுடன் அல்லது வேறு போனில் மீண்டும் முயற்சிக்கவும். நன்றி.',
      introC_h: 'பகுதி 1: உண்மையான மனிதரா, கணினியா?',
      introC_p: 'அடுத்து வரும் சில அழைப்புகளை உண்மையான மனிதர் பேசியிருக்கிறார், சிலவற்றைக் கணினிக் குரல் பேசியிருக்கிறது. ஒவ்வொன்றையும் ஒரு முறை கேட்டு உங்கள் கருத்தைச் சொல்லுங்கள்.',
      introB_h: 'பகுதி {part}: தனித்தனி அழைப்புகள்',
      introB_p: 'நீங்கள் {n} சிறிய அழைப்புகளைக் கேட்பீர்கள். ஒவ்வொரு அழைப்பாளரும் உங்களை அழைக்கிறார் என்று நினைத்துக்கொள்ளுங்கள். ஒவ்வொரு அழைப்பும் ஒரு முறை மட்டுமே ஒலிக்கும், எனவே கவனமாகக் கேட்டு, பிறகு கேள்விகளுக்குப் பதில் சொல்லுங்கள்.',
      introA_h: 'பகுதி {part}: அழைப்பு ஜோடிகள்',
      introA_p: 'இப்போது A, B என்ற இரண்டு அழைப்பாளர்கள் ஒரே விஷயத்தைச் சொல்வதைக் கேட்பீர்கள். இரண்டையும் கேட்டு, யாருடன் தொடர்ந்து பேச விரும்புவீர்கள் என்று தேர்ந்தெடுங்கள். உண்மையிலேயே தேர்ந்தெடுக்க முடியவில்லை என்றால் “வேறுபாடு இல்லை” என்பதை அழுத்துங்கள்.',
      begin: 'தொடங்கு',
      call_n: 'அழைப்பு {n} / {N}', pair_n: 'ஜோடி {n} / {N}',
      play_call: 'அழைப்பை இயக்கு', playing: 'ஒலிக்கிறது…', played: 'ஒலித்து முடிந்தது',
      audio_stuck: 'ஒலி நின்றதா அல்லது ஒலிக்கவில்லையா? மீண்டும் இயக்கு',
      comp_h: 'அழைப்பாளர் என்ன சொன்னார்?',
      q_nat: 'குரல் எவ்வளவு இயல்பாக இருந்தது?',
      nat: ['முற்றிலும் இயல்பற்றது', 'இயல்பற்றது', 'ஓரளவு இயல்பானது', 'இயல்பானது', 'முற்றிலும் இயல்பானது'],
      q_trust: 'இந்த அழைப்பாளர் சொல்வதை நான் நம்புவேன்.',
      q_patr: 'இந்த அழைப்பாளர் என்னைத் தாழ்வாக நினைத்துப் பேசினார், அல்லது இங்குள்ளவர்கள் பேசும் விதத்தைக் கேலி செய்தார்.',
      q_fit: 'இந்த அழைப்பாளர் என் பகுதியைச் சேர்ந்தவர் போல் தெரிகிறார்.',
      agree_lo: 'முற்றிலும் உடன்படவில்லை', agree_hi: 'முற்றிலும் உடன்படுகிறேன்',
      q_cont: 'இந்த அழைப்பைத் தொடர்வீர்களா?',
      cont: ['நிச்சயமாக இல்லை', 'அநேகமாக இல்லை', 'உறுதியாகத் தெரியவில்லை', 'அநேகமாக ஆம்', 'நிச்சயமாக ஆம்'],
      attn: 'நீங்கள் படிக்கிறீர்களா என்று இந்த வரிசை சோதிக்கிறது: இந்த வரிசையில் 2 ஐ அழுத்துங்கள்.',
      play_both: 'A, பிறகு B இயக்கு', replay_a: 'A மீண்டும் இயக்கு', replay_b: 'B மீண்டும் இயக்கு',
      caller_a: 'அழைப்பாளர் A', caller_b: 'அழைப்பாளர் B',
      q_pref: 'எந்த அழைப்பாளருடன் தொடர்ந்து பேச விரும்புவீர்கள்?',
      pref: { A2: 'A, தெளிவாக', A1: 'A, சற்று', '0': 'வேறுபாடு இல்லை', B1: 'B, சற்று', B2: 'B, தெளிவாக' },
      q_hai: 'இது உண்மையான மனிதரா, கணினிக் குரலா?', hai_h: 'உண்மையான மனிதர்', hai_c: 'கணினிக் குரல்',
      q_conf: 'எவ்வளவு உறுதியாக இருக்கிறீர்கள்?', conf: ['ஊகம்', 'ஓரளவு உறுதி', 'மிக உறுதி'],
      close_h: 'கடைசிக் கேள்வி', close_q: 'இந்த அழைப்பாளர்களிடம் ஏதாவது சரியில்லை என்று தோன்றியதா? என்ன? (விருப்பம்)',
      close_ph: 'எந்த மொழியிலும் இங்கே எழுதுங்கள்', finish: 'முடி',
      done_h: 'நன்றி!',
      debrief: 'இந்த ஆய்வு எதைப் பற்றியது: மக்கள் தங்கள் சொந்த மொழியில் அல்லது உள்ளூர் பேச்சு வழக்கில் பேசும் அழைப்பாளர்களை விரும்புகிறார்களா, அது மரியாதையாகத் தோன்றுகிறதா என்று சோதிக்கிறோம். {voices} உங்கள் பதில்கள் இந்த ஆய்வுக்கு மட்டுமே பயன்படுத்தப்படும்.',
      voices_tts: 'நீங்கள் கேட்ட எல்லாக் குரல்களும் கணினியால் உருவாக்கப்பட்டவை.',
      voices_mixed: 'பகுதி 1-இல் சில அழைப்புகளை உண்மையான மனிதர்கள் எழுதியதைப் படித்துப் பேசினார்கள்; மற்ற எல்லாக் குரல்களும் கணினியால் உருவாக்கப்பட்டவை.',
      send_h: 'உங்கள் பதில்களை அனுப்புங்கள்',
      send_p: 'நீங்கள் அனுப்பும் வரை உங்கள் பதில்கள் இந்த போனில் மட்டுமே சேமிக்கப்பட்டுள்ளன. தயவுசெய்து இப்போதே உங்கள் ஒருங்கிணைப்பாளருக்கு அனுப்புங்கள்.',
      send_share: 'அனுப்பு (WhatsApp அல்லது மின்னஞ்சல்)', send_download: 'பதில் கோப்பைப் பதிவிறக்கு', send_csv: 'அட்டவணையைப் பதிவிறக்கு (CSV)',
      send_copy: 'பதில் குறியீட்டை நகலெடு', copied: 'நகலெடுக்கப்பட்டது. WhatsApp-இல் உங்கள் ஒருங்கிணைப்பாளருக்கு ஒட்டுங்கள்.',
      copy_fail: 'தானாக நகலெடுக்க முடியவில்லை. கீழே உள்ள குறியீட்டைத் தேர்ந்தெடுத்து நகலெடுங்கள்.',
      completion: 'நிறைவுக் குறியீடு: {code}. இதை உங்கள் ஒருங்கிணைப்பாளரிடம் சொல்லுங்கள்.',
      payment: 'உங்கள் பதில்கள் வந்த பிறகு உங்கள் ஒருங்கிணைப்பாளர் UPI மூலம் ₹{amount} அனுப்புவார்.',
      not_configured: 'இந்த ஆய்வுப் பக்கம் இன்னும் தயாராகவில்லை (உரிமையாளர், தொடர்பு அல்லது கட்டண விவரம் இல்லை). உங்கள் ஒருங்கிணைப்பாளரிடம் சொல்லுங்கள்.',
      bad_link: 'இந்த இணைப்பு முழுமையில்லை அல்லது தவறானது. உங்கள் ஒருங்கிணைப்பாளரிடம் புதிய இணைப்பைக் கேளுங்கள்.',
      pilot_banner: 'சோதனைச் சுற்று: இந்தப் பதில்கள் முக்கிய முடிவுகளில் பயன்படுத்தப்படாது.',
      test_banner: 'சோதனை முறை',
      retest_p: 'மீண்டும் வருக. இந்தச் சிறிய அமர்வில் அழைப்பு ஜோடிகள் மட்டும் மீண்டும் வரும் (சுமார் 8 நிமிடங்கள்).',
      storage_warn: 'இந்த உலாவி முன்னேற்றத்தைச் சேமிக்கவில்லை. பதில்களை அனுப்பும் வரை பக்கத்தை மூடாதீர்கள்.',
    },
    mr: {
      title: 'ऐकण्याचा अभ्यास',
      welcome_h: 'फोन करणाऱ्यांची चाचणी करायला आम्हाला मदत करा',
      welcome_p: ['तुम्ही कंपन्यांच्या काही छोट्या फोन कॉल रेकॉर्डिंग ऐकाल आणि त्यांच्याबद्दलच्या प्रश्नांची उत्तरे द्याल. याला सुमारे 25 मिनिटे लागतील.',
        'कृपया शांत ठिकाणी बसा. इयरफोन असतील तर वापरा.'],
      start: 'सुरू करा',
      resume_q: 'या फोनवर तुमचे एक अपूर्ण सत्र आहे. जिथे थांबला होतात तिथून पुढे सुरू करायचे?',
      resume_yes: 'पुढे सुरू करा', resume_no: 'पुन्हा सुरुवात करा',
      consent_h: 'सुरू करण्यापूर्वी',
      consent: [
        'हा {owner} यांनी चालवलेला एक संशोधन अभ्यास आहे. वेगवेगळ्या फोन करणाऱ्यांबद्दल लोकांना काय वाटते हे आम्हाला जाणून घ्यायचे आहे.',
        'तुम्हाला काय करायचे आहे: सुमारे 30 छोट्या रेकॉर्डिंग (प्रत्येकी 10 ते 15 सेकंद) ऐकून प्रश्नांची उत्तरे द्यायची. याला सुमारे 25 मिनिटे लागतील.',
        'आम्ही काय नोंदवतो: तुमची उत्तरे, वयोगट, लिंग, मूळ राज्य आणि जिल्हा, तुम्ही सध्या राहता ते राज्य, तुम्ही बोलता त्या भाषा, शिक्षण, आणि तुम्ही वापरता तो फोन व इयरफोनचा प्रकार. आम्ही तुमच्या उत्तरांसोबत तुमचे नाव, फोन नंबर किंवा आवाज नोंदवत नाही. उत्तरे पाठवताना किंवा पैसे घेताना तुमचे समन्वयक तुमचा फोन नंबर आणि UPI माहिती पाहतात; ते ती उत्तरांपासून वेगळी ठेवतात, फक्त पैसे देण्यासाठी वापरतात आणि पैसे दिल्यानंतर पुसून टाकतात.',
        'मोबदला: पूर्ण केल्यानंतर UPI ने ₹{amount}.',
        'तुमची निवड: भाग घेणे तुमच्या इच्छेवर आहे. हे पान बंद करून तुम्ही कधीही थांबू शकता; मध्येच थांबलात तर तुमची उत्तरे वापरली जाणार नाहीत. आधीच पाठवलेली उत्तरे मागे घेण्यासाठी {months} महिन्यांच्या आत तुमचा सहभागी कोड {pid} घेऊन {contact} यांच्याशी संपर्क करा; आम्ही ती पुसून टाकू.',
        'अभ्यास संपल्यानंतर आम्ही उत्तरे {months} महिने ठेवतो आणि मग पुसून टाकतो. निकाल फक्त गटाच्या एकूण आकड्यांच्या स्वरूपात प्रसिद्ध होतात. तुमच्या माहितीबद्दल प्रश्न किंवा तक्रार असल्यास {contact} यांच्याशी संपर्क करा.',
        'तुम्ही ऐकणार असलेले काही आवाज संगणकाने तयार केलेले आहेत, आणि कॉलमधली दुकाने व कंपन्या काल्पनिक आहेत. कोणतेही उत्तर बरोबर किंवा चूक नाही, फक्त तुम्ही लक्ष देऊन ऐकत आहात का हे तपासणारे काही प्रश्न सोडून.'],
      consent_yes: 'माझे वय 18 किंवा त्याहून जास्त आहे आणि मी भाग घ्यायला तयार आहे',
      consent_no: 'मला भाग घ्यायचा नाही',
      declined: 'धन्यवाद. काहीही नोंदवले गेलेले नाही. तुम्ही हे पान बंद करू शकता.',
      screen_h: 'तुमच्याबद्दल',
      screen_p: 'आम्ही तुमचे नाव किंवा फोन नंबर विचारत नाही.',
      q_age: 'तुमचे वय', q_gender: 'लिंग', q_home_state: 'तुमचे मूळ राज्य (जिथून तुमचे कुटुंब आहे)',
      q_home_district: 'मूळ जिल्हा', q_cur_state: 'तुम्ही सध्या कुठे राहता?', q_place: 'तुम्ही सध्या राहता ते ठिकाण',
      q_mt: 'तुमची मातृभाषा', q_home_lang: 'घरी तुम्ही बहुतेक कोणती भाषा बोलता',
      q_other_langs: 'तुम्हाला चांगल्या समजणाऱ्या इतर भाषा (लागू असतील त्या सर्व निवडा)', q_edu: 'शिक्षण',
      q_phone: 'तुमचा फोन', q_device: 'तुम्ही कसे ऐकत आहात?',
      q_work: 'गेल्या 12 महिन्यांत तुम्ही टेलिकॉलिंग, कॉल सेंटर किंवा BPO मध्ये, किंवा AI किंवा व्हॉइस सॉफ्टवेअर बनवणाऱ्या कंपनीत काम केले आहे का?',
      q_know: 'हा अभ्यास चालवणाऱ्यांपैकी कोणाला तुम्ही वैयक्तिकरित्या ओळखता का?',
      q_before: 'ट्रायल फेरीसह, तुम्ही याआधी या ऐकण्याच्या अभ्यासात भाग घेतला आहे का?',
      yes: 'हो', no: 'नाही', next: 'पुढे', required: 'कृपया प्रत्येक प्रश्नाचे उत्तर द्या.',
      screened_out: 'तुमच्या वेळेबद्दल धन्यवाद. हा अभ्यास विशिष्ट पार्श्वभूमीच्या लोकांना शोधत आहे, म्हणून आपण इथेच थांबू. आणखी काहीही नोंदवलेले नाही.',
      check_h: 'आवाजाची तपासणी',
      check_p: 'इयरफोन असतील तर लावा, नाहीतर फोन कानाला लावा. आवाज आरामदायक ठेवा. बटण दाबा आणि बीप मोजा.',
      check_play: 'बीप वाजवा', check_q: 'तुम्ही किती बीप ऐकले?',
      check_retry: 'ते बरोबर नव्हते. आवाज तपासा आणि पुन्हा प्रयत्न करा.',
      check_fail: 'या फोनवर आवाज नीट चालतो याची खात्री आम्ही करू शकलो नाही. कृपया नंतर इयरफोनसह किंवा दुसऱ्या फोनवर पुन्हा प्रयत्न करा. धन्यवाद.',
      introC_h: 'भाग 1: खरी व्यक्ती की संगणक?',
      introC_p: 'पुढचे काही कॉल खऱ्या व्यक्तीने बोललेले आहेत आणि काही संगणकाच्या आवाजाने. प्रत्येक कॉल एकदा ऐका आणि तुम्हाला काय वाटते ते सांगा.',
      introB_h: 'भाग {part}: एकेक कॉल',
      introB_p: 'तुम्ही {n} छोटे कॉल ऐकाल. प्रत्येक फोन करणारा तुम्हालाच फोन करत आहे अशी कल्पना करा. प्रत्येक कॉल फक्त एकदाच वाजेल, म्हणून लक्ष देऊन ऐका आणि मग प्रश्नांची उत्तरे द्या.',
      introA_h: 'भाग {part}: कॉलच्या जोड्या',
      introA_p: 'आता तुम्ही A आणि B असे दोन फोन करणारे एकच गोष्ट सांगताना ऐकाल. दोन्ही ऐका, मग कोणाशी बोलणे पुढे चालू ठेवायला आवडेल ते निवडा. खरोखरच निवडता येत नसेल तर “काही फरक नाही” दाबा.',
      begin: 'सुरू करा',
      call_n: 'कॉल {n} / {N}', pair_n: 'जोडी {n} / {N}',
      play_call: 'कॉल वाजवा', playing: 'वाजत आहे…', played: 'वाजून झाला',
      audio_stuck: 'आवाज थांबला किंवा वाजलाच नाही? पुन्हा वाजवा',
      comp_h: 'फोन करणारा काय म्हणाला?',
      q_nat: 'आवाज किती नैसर्गिक वाटला?',
      nat: ['अजिबात नैसर्गिक नाही', 'अनैसर्गिक', 'थोडा नैसर्गिक', 'नैसर्गिक', 'पूर्णपणे नैसर्गिक'],
      q_trust: 'हा फोन करणारा जे सांगतो त्यावर मी विश्वास ठेवेन.',
      q_patr: 'हा फोन करणारा मला कमी लेखून बोलत होता, किंवा इथले लोक ज्या पद्धतीने बोलतात त्याची थट्टा करत होता.',
      q_fit: 'हा फोन करणारा माझ्या भागातील कोणी वाटतो.',
      agree_lo: 'अजिबात सहमत नाही', agree_hi: 'पूर्णपणे सहमत',
      q_cont: 'तुम्ही हा कॉल पुढे चालू ठेवाल का?',
      cont: ['नक्कीच नाही', 'बहुधा नाही', 'खात्री नाही', 'बहुधा हो', 'नक्कीच हो'],
      attn: 'तुम्ही वाचत आहात का हे ही ओळ तपासते: कृपया या ओळीत 2 दाबा.',
      play_both: 'A, मग B वाजवा', replay_a: 'A पुन्हा वाजवा', replay_b: 'B पुन्हा वाजवा',
      caller_a: 'फोन करणारा A', caller_b: 'फोन करणारा B',
      q_pref: 'कोणत्या फोन करणाऱ्याशी बोलणे पुढे चालू ठेवायला तुम्हाला आवडेल?',
      pref: { A2: 'A, स्पष्टपणे', A1: 'A, थोडेसे', '0': 'काही फरक नाही', B1: 'B, थोडेसे', B2: 'B, स्पष्टपणे' },
      q_hai: 'ही खरी व्यक्ती होती की संगणकाचा आवाज?', hai_h: 'खरी व्यक्ती', hai_c: 'संगणकाचा आवाज',
      q_conf: 'तुम्हाला किती खात्री आहे?', conf: ['अंदाज', 'बऱ्यापैकी खात्री', 'पूर्ण खात्री'],
      close_h: 'शेवटचा प्रश्न', close_q: 'या फोन करणाऱ्यांमध्ये तुम्हाला काही खटकले का? काय? (ऐच्छिक)',
      close_ph: 'इथे कोणत्याही भाषेत लिहा', finish: 'पूर्ण करा',
      done_h: 'धन्यवाद!',
      debrief: 'हा अभ्यास कशाबद्दल आहे: लोकांना त्यांच्या स्वतःच्या भाषेत किंवा स्थानिक बोलीत बोलणारे फोन करणारे आवडतात का, आणि ते आदरपूर्वक वाटते का, हे आम्ही तपासत आहोत. {voices} तुमची उत्तरे फक्त या संशोधनासाठी वापरली जातील.',
      voices_tts: 'तुम्ही ऐकलेले सर्व आवाज संगणकाने तयार केलेले होते.',
      voices_mixed: 'भाग 1 मधील काही कॉल खऱ्या लोकांनी लिहिलेले वाचून बोलले होते; बाकी सर्व आवाज संगणकाने तयार केलेले होते.',
      send_h: 'तुमची उत्तरे पाठवा',
      send_p: 'तुम्ही पाठवेपर्यंत तुमची उत्तरे फक्त याच फोनवर जतन आहेत. कृपया आत्ताच तुमच्या समन्वयकांना पाठवा.',
      send_share: 'पाठवा (WhatsApp किंवा ईमेल)', send_download: 'उत्तरांची फाइल डाउनलोड करा', send_csv: 'तक्ता डाउनलोड करा (CSV)',
      send_copy: 'उत्तर कोड कॉपी करा', copied: 'कॉपी झाले. WhatsApp वर तुमच्या समन्वयकांना पेस्ट करा.',
      copy_fail: 'आपोआप कॉपी झाले नाही. खालील कोड निवडून कॉपी करा.',
      completion: 'पूर्णता कोड: {code}. हा तुमच्या समन्वयकांना सांगा.',
      payment: 'तुमची उत्तरे पोहोचल्यानंतर तुमचे समन्वयक UPI ने ₹{amount} पाठवतील.',
      not_configured: 'हे अभ्यासाचे पान अजून तयार नाही (मालक, संपर्क किंवा मोबदल्याची माहिती नाही). कृपया तुमच्या समन्वयकांना सांगा.',
      bad_link: 'ही लिंक अपूर्ण किंवा चुकीची आहे. कृपया तुमच्या समन्वयकांकडून नवीन लिंक मागा.',
      pilot_banner: 'ट्रायल फेरी: ही उत्तरे मुख्य निकालांमध्ये वापरली जाणार नाहीत.',
      test_banner: 'चाचणी मोड',
      retest_p: 'पुन्हा स्वागत आहे. या छोट्या सत्रात फक्त कॉलच्या जोड्या पुन्हा येतील (सुमारे 8 मिनिटे).',
      storage_warn: 'हा ब्राउझर प्रगती जतन करत नाही. उत्तरे पाठवेपर्यंत पान बंद करू नका.',
    },
  };

  // Screening options: value -> label per language. Values are what the export and analysis use.
  const L = (en, hi, ta, mr) => ({ en, hi, ta, mr });
  const OPT = {
    age: [['under18', L('Under 18', '18 से कम', '18க்குக் கீழ்', '18 पेक्षा कमी')], ['18-29', L('18–29')], ['30-44', L('30–44')],
      ['45-59', L('45–59')], ['60+', L('60 or older', '60 या ज़्यादा', '60 அல்லது அதற்கு மேல்', '60 किंवा अधिक')]],
    gender: [['woman', L('Woman', 'महिला', 'பெண்', 'स्त्री')], ['man', L('Man', 'पुरुष', 'ஆண்', 'पुरुष')],
      ['other', L('Other / prefer not to say', 'अन्य / नहीं बताना चाहते', 'மற்றவை / சொல்ல விரும்பவில்லை', 'इतर / सांगू इच्छित नाही')]],
    state: [['bihar', L('Bihar', 'बिहार', 'பீகார்', 'बिहार')], ['up', L('Uttar Pradesh', 'उत्तर प्रदेश', 'உத்தரப் பிரதேசம்', 'उत्तर प्रदेश')],
      ['jharkhand', L('Jharkhand', 'झारखंड', 'ஜார்கண்ட்', 'झारखंड')], ['delhi', L('Delhi', 'दिल्ली', 'டெல்லி', 'दिल्ली')],
      ['haryana', L('Haryana', 'हरियाणा', 'ஹரியானா', 'हरियाणा')], ['mp', L('Madhya Pradesh', 'मध्य प्रदेश', 'மத்தியப் பிரதேசம்', 'मध्य प्रदेश')],
      ['tamilnadu', L('Tamil Nadu', 'तमिलनाडु', 'தமிழ்நாடு', 'तमिळनाडू')], ['maharashtra', L('Maharashtra', 'महाराष्ट्र', 'மகாராஷ்டிரா', 'महाराष्ट्र')],
      ['karnataka', L('Karnataka', 'कर्नाटक', 'கர்நாடகா', 'कर्नाटक')], ['gujarat', L('Gujarat', 'गुजरात', 'குஜராத்', 'गुजरात')],
      ['westbengal', L('West Bengal', 'पश्चिम बंगाल', 'மேற்கு வங்கம்', 'पश्चिम बंगाल')],
      ['other', L('Other state', 'अन्य राज्य', 'வேறு மாநிலம்', 'इतर राज्य')]],
    abroad: [['abroad', L('Outside India', 'भारत के बाहर', 'இந்தியாவுக்கு வெளியே', 'भारताबाहेर')]],
    place: [['village', L('Village', 'गाँव', 'கிராமம்', 'गाव')], ['town', L('Small town', 'छोटा शहर / कस्बा', 'சிறு நகரம்', 'छोटे शहर')],
      ['city', L('City', 'शहर', 'நகரம்', 'शहर')]],
    lang: [['bhojpuri', L('Bhojpuri', 'भोजपुरी', 'போஜ்புரி', 'भोजपुरी')], ['hindi', L('Hindi', 'हिंदी', 'இந்தி', 'हिंदी')],
      ['maithili', L('Maithili', 'मैथिली', 'மைதிலி', 'मैथिली')], ['magahi', L('Magahi', 'मगही', 'மகஹி', 'मगही')],
      ['haryanvi', L('Haryanvi', 'हरियाणवी', 'ஹரியான்வி', 'हरियाणवी')], ['tamil', L('Tamil', 'तमिल', 'தமிழ்', 'तमिळ')],
      ['marathi', L('Marathi', 'मराठी', 'மராத்தி', 'मराठी')], ['english', L('English', 'अंग्रेज़ी', 'ஆங்கிலம்', 'इंग्रजी')],
      ['other', L('Other', 'अन्य', 'மற்றவை', 'इतर')]],
    edu: [['lt10', L('Below class 10', '10वीं से कम', '10ஆம் வகுப்புக்குக் கீழ்', 'दहावीपेक्षा कमी')],
      ['10-12', L('Class 10 to 12', '10वीं से 12वीं', '10 முதல் 12ஆம் வகுப்பு', 'दहावी ते बारावी')],
      ['grad', L('Graduate', 'ग्रेजुएट', 'பட்டப்படிப்பு', 'पदवीधर')], ['pg', L('Postgraduate', 'पोस्ट-ग्रेजुएट', 'முதுநிலைப் பட்டம்', 'पदव्युत्तर')]],
    phone: [['android', L('Android')], ['iphone', L('iPhone')], ['other', L('Other', 'अन्य', 'மற்றவை', 'इतर')]],
    device: [['wired', L('Wired earphones', 'तार वाले ईयरफ़ोन', 'வயர் இயர்போன்', 'वायरचे इयरफोन')],
      ['bluetooth', L('Bluetooth earphones', 'ब्लूटूथ ईयरफ़ोन', 'ப்ளூடூத் இயர்போன்', 'ब्लूटूथ इयरफोन')],
      ['earpiece', L('Phone held to my ear', 'फ़ोन कान पर लगाकर', 'போனைக் காதில் வைத்து', 'फोन कानाला लावून')],
      ['speaker', L('Loudspeaker', 'लाउडस्पीकर', 'ஸ்பீக்கர்', 'स्पीकर')]],
  };

  // Panel eligibility (protocol 2.2). Returns null when eligible, else a reason code.
  const ELIG = {
    bihar: (s) => (s.mt === 'bhojpuri' && s.home_lang === 'bhojpuri' && ['bihar', 'up'].includes(s.home_state)) ? null : 'panel_mismatch',
    outgroup: (s) => (['hindi', 'haryanvi'].includes(s.mt) && !['bhojpuri', 'maithili', 'magahi'].includes(s.home_lang) &&
      !(s.other_langs || []).includes('bhojpuri') && ['delhi', 'haryana', 'up', 'mp'].includes(s.home_state)) ? null : 'panel_mismatch',
    tamilnadu: (s) => (s.mt === 'tamil' && s.home_state === 'tamilnadu') ? null : 'panel_mismatch',
    maharashtra: (s) => (s.mt === 'marathi' && s.home_state === 'maharashtra') ? null : 'panel_mismatch',
  };

  // Comprehension questions per turn. Option "a" is the correct one; display order is shuffled per listener.
  const COMP = {
    T1: [{ q: L('According to the caller, who was speaking?', 'कॉल करने वाले के अनुसार, कौन बात कर रहा था?', 'அழைத்தவர் சொன்னபடி, யார் பேசினார்கள்?', 'फोन करणाऱ्याच्या म्हणण्यानुसार कोण बोलत होते?'),
      a: L('An AI assistant (a computer)', 'एक AI असिस्टेंट (कंप्यूटर)', 'ஒரு AI உதவியாளர் (கணினி)', 'एक AI असिस्टंट (संगणक)'),
      b: L('A bank officer', 'बैंक का अधिकारी', 'வங்கி அதிகாரி', 'बँकेचे अधिकारी'), c: L('A delivery person', 'डिलीवरी वाला', 'டெலிவரி செய்பவர்', 'डिलिव्हरी करणारा'),
      d: L('The caller did not say', 'उन्होंने नहीं बताया', 'அவர் சொல்லவில்லை', 'त्यांनी सांगितले नाही') },
    { q: L('What was the call about?', 'कॉल किस बारे में थी?', 'அழைப்பு எதைப் பற்றியது?', 'फोन कशाबद्दल होता?'),
      a: L('A bike on EMI', 'EMI पर बाइक', 'EMI-யில் பைக்', 'EMI वर बाईक'), b: L('Health insurance', 'हेल्थ इंश्योरेंस', 'மருத்துவக் காப்பீடு', 'आरोग्य विमा'),
      c: L('A food order', 'खाने का ऑर्डर', 'உணவு ஆர்டர்', 'जेवणाची ऑर्डर'), d: L('A mobile recharge', 'मोबाइल रिचार्ज', 'மொபைல் ரீசார்ஜ்', 'मोबाईल रिचार्ज') }],
    T2: [{ q: L('What is the on-road price?', 'ऑन-रोड कीमत कितनी है?', 'ஆன்-ரோடு விலை என்ன?', 'ऑन-रोड किंमत किती आहे?'),
      a: L('₹82,500'), b: L('₹85,200'), c: L('₹28,500'), d: L('₹62,500') },
    { q: L('What is the EMI?', 'EMI कितनी है?', 'EMI எவ்வளவு?', 'EMI किती आहे?'),
      a: L('About ₹2,950 a month for 24 months', 'लगभग ₹2,950 महीना, 24 महीने के लिए', 'மாதம் சுமார் ₹2,950, 24 மாதங்களுக்கு', 'महिन्याला सुमारे ₹2,950, 24 महिन्यांसाठी'),
      b: L('About ₹2,590 a month for 24 months', 'लगभग ₹2,590 महीना, 24 महीने के लिए', 'மாதம் சுமார் ₹2,590, 24 மாதங்களுக்கு', 'महिन्याला सुमारे ₹2,590, 24 महिन्यांसाठी'),
      c: L('About ₹2,950 a month for 12 months', 'लगभग ₹2,950 महीना, 12 महीने के लिए', 'மாதம் சுமார் ₹2,950, 12 மாதங்களுக்கு', 'महिन्याला सुमारे ₹2,950, 12 महिन्यांसाठी'),
      d: L('About ₹9,250 a month for 24 months', 'लगभग ₹9,250 महीना, 24 महीने के लिए', 'மாதம் சுமார் ₹9,250, 24 மாதங்களுக்கு', 'महिन्याला सुमारे ₹9,250, 24 महिन्यांसाठी') }],
    T3: [{ q: L('What is the EMI on the longer plan?', 'लंबे प्लान में EMI कितनी है?', 'நீண்ட திட்டத்தில் EMI எவ்வளவு?', 'मोठ्या प्लॅनमध्ये EMI किती आहे?'),
      a: L('About ₹2,200', 'लगभग ₹2,200', 'சுமார் ₹2,200', 'सुमारे ₹2,200'), b: L('About ₹2,950', 'लगभग ₹2,950', 'சுமார் ₹2,950', 'सुमारे ₹2,950'),
      c: L('About ₹1,200', 'लगभग ₹1,200', 'சுமார் ₹1,200', 'सुमारे ₹1,200'), d: L('About ₹3,600', 'लगभग ₹3,600', 'சுமார் ₹3,600', 'सुमारे ₹3,600') },
    { q: L('When is the free test ride offered?', 'फ्री टेस्ट राइड कब के लिए कही गई?', 'இலவச டெஸ்ட் ரைடு எப்போது?', 'मोफत टेस्ट राइड कधी आहे?'),
      a: L('Saturday, 11 am', 'शनिवार, सुबह 11 बजे', 'சனிக்கிழமை, காலை 11 மணி', 'शनिवार, सकाळी 11 वाजता'),
      b: L('Sunday, 11 am', 'रविवार, सुबह 11 बजे', 'ஞாயிற்றுக்கிழமை, காலை 11 மணி', 'रविवार, सकाळी 11 वाजता'),
      c: L('Saturday, 1 pm', 'शनिवार, दोपहर 1 बजे', 'சனிக்கிழமை, மதியம் 1 மணி', 'शनिवार, दुपारी 1 वाजता'),
      d: L('Friday, 11 am', 'शुक्रवार, सुबह 11 बजे', 'வெள்ளிக்கிழமை, காலை 11 மணி', 'शुक्रवार, सकाळी 11 वाजता') }],
    T4: [{ q: L('How much is the order?', 'ऑर्डर कितने का है?', 'ஆர்டரின் விலை எவ்வளவு?', 'ऑर्डर किती रुपयांची आहे?'),
      a: L('₹1,299'), b: L('₹1,999'), c: L('₹2,199'), d: L('₹999') },
    { q: L('When will it arrive?', 'ऑर्डर कब पहुँचेगा?', 'எப்போது வந்து சேரும்?', 'ऑर्डर कधी येईल?'),
      a: L('Tomorrow, 10 am to 2 pm', 'कल, सुबह 10 से दोपहर 2 बजे के बीच', 'நாளை, காலை 10 முதல் மதியம் 2 மணி வரை', 'उद्या, सकाळी 10 ते दुपारी 2 दरम्यान'),
      b: L('Today, 10 am to 2 pm', 'आज, सुबह 10 से दोपहर 2 बजे के बीच', 'இன்று, காலை 10 முதல் மதியம் 2 மணி வரை', 'आज, सकाळी 10 ते दुपारी 2 दरम्यान'),
      c: L('Tomorrow, 2 pm to 6 pm', 'कल, दोपहर 2 से शाम 6 बजे के बीच', 'நாளை, மதியம் 2 முதல் மாலை 6 மணி வரை', 'उद्या, दुपारी 2 ते संध्याकाळी 6 दरम्यान'),
      d: L('Day after tomorrow, morning', 'परसों सुबह', 'நாளை மறுநாள் காலை', 'परवा सकाळी') }],
    T5: [{ q: L('What happened?', 'क्या हुआ था?', 'என்ன நடந்தது?', 'काय झाले?'),
      a: L('The delivery person could not reach you', 'डिलीवरी वाला आपसे संपर्क नहीं कर पाया', 'டெலிவரி செய்பவரால் உங்களைத் தொடர்பு கொள்ள முடியவில்லை', 'डिलिव्हरी करणाऱ्याचा तुमच्याशी संपर्क झाला नाही'),
      b: L('The order was cancelled', 'ऑर्डर कैंसल हो गया', 'ஆர்டர் ரத்து செய்யப்பட்டது', 'ऑर्डर रद्द झाली'),
      c: L('The payment failed', 'पेमेंट फेल हो गया', 'பணம் செலுத்துதல் தோல்வியடைந்தது', 'पेमेंट अयशस्वी झाले'),
      d: L('The item is out of stock', 'सामान स्टॉक में नहीं है', 'பொருள் கையிருப்பில் இல்லை', 'वस्तू स्टॉकमध्ये नाही') },
    { q: L('What did the caller offer?', 'कॉल करने वाले ने क्या विकल्प दिए?', 'அழைத்தவர் என்ன வழிகளைச் சொன்னார்?', 'फोन करणाऱ्याने कोणते पर्याय दिले?'),
      a: L('Try again tomorrow evening, or change the address', 'कल शाम फिर कोशिश, या पता बदलना', 'நாளை மாலை மீண்டும் முயற்சி, அல்லது முகவரியை மாற்றுவது', 'उद्या संध्याकाळी पुन्हा प्रयत्न, किंवा पत्ता बदलणे'),
      b: L('A refund or a replacement', 'रिफंड या बदले में दूसरा सामान', 'பணத்தைத் திருப்பித் தருவது அல்லது மாற்றுப் பொருள்', 'पैसे परत किंवा दुसरी वस्तू'),
      c: L('Pick it up from the shop', 'दुकान से खुद ले जाना', 'கடையில் வந்து வாங்கிக்கொள்வது', 'दुकानातून स्वतः घेऊन जाणे'),
      d: L('Pay online now', 'अभी ऑनलाइन पेमेंट करना', 'இப்போதே ஆன்லைனில் பணம் செலுத்துவது', 'आत्ताच ऑनलाइन पैसे भरणे') }],
    T6: [{ q: L('When is the renewal due?', 'रिन्यूअल कब है?', 'ரினியூவல் (புதுப்பித்தல்) எப்போது?', 'रिन्यूअल कधी आहे?'),
      a: L('15 November', '15 नवंबर', 'நவம்பர் 15', '15 नोव्हेंबर'), b: L('15 December', '15 दिसंबर', 'டிசம்பர் 15', '15 डिसेंबर'),
      c: L('5 November', '5 नवंबर', 'நவம்பர் 5', '5 नोव्हेंबर'), d: L('25 November', '25 नवंबर', 'நவம்பர் 25', '25 नोव्हेंबर') },
    { q: L('What is the premium?', 'प्रीमियम कितना है?', 'பிரீமியம் எவ்வளவு?', 'प्रीमियम किती आहे?'),
      a: L('₹24,500 a year', '₹24,500 सालाना', 'ஆண்டுக்கு ₹24,500', 'वर्षाला ₹24,500'), b: L('₹24,500 a month', '₹24,500 महीना', 'மாதத்திற்கு ₹24,500', 'महिन्याला ₹24,500'),
      c: L('₹42,500 a year', '₹42,500 सालाना', 'ஆண்டுக்கு ₹42,500', 'वर्षाला ₹42,500'), d: L('₹2,450 a year', '₹2,450 सालाना', 'ஆண்டுக்கு ₹2,450', 'वर्षाला ₹2,450') }],
  };

  // ===== Utilities =====
  const params = new URLSearchParams(location.search);
  const app = () => document.getElementById('app');
  const player = () => document.getElementById('player');
  let lang = LANGS[params.get('lang')] ? params.get('lang') : null;
  function t(key, vars) {
    let v = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : I18N.en[key];
    if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return v;
  }
  const lbl = (o) => (o[lang] !== undefined ? o[lang] : o.en);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  function fnv1a(str) {
    let x = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    return ('0000000' + x.toString(16)).slice(-8);
  }
  function rngFrom(seed) {               // mulberry32 seeded from a string
    let a = parseInt(fnv1a(seed), 16) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let z = Math.imul(a ^ (a >>> 15), 1 | a); z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z; return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffled(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }
  const store = {
    ok: true,
    get(k) { try { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { store.ok = false; return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  function probeStorage() { try { localStorage.setItem('vpl:probe', '1'); localStorage.removeItem('vpl:probe'); return true; } catch (e) { return false; } }

  // ===== State =====
  let PLAN = null, SCHED = null, S = null, T0 = Date.now();
  const mode = ['field', 'pilot', 'kiosk', 'test'].includes(params.get('mode')) ? params.get('mode') : 'field';
  const retest = params.get('retest') === '1';
  const assisted = params.get('assisted') === '1';   // coordinator reads on-screen text aloud (kiosk sessions, protocol 10.4)
  const speed = mode === 'test' ? Math.min(16, Math.max(1, Number(params.get('speed')) || 1)) : 1;
  const ms = () => Date.now() - T0;
  window.VPL = { registerPlan(p) { PLAN = p; } };

  function save() {
    if (!S) return;
    S.saved_at = new Date().toISOString();
    store.set('vpl:s:' + S.session_id, S);
    const idx = store.get('vpl:index') || [];
    if (!idx.includes(S.session_id)) { idx.push(S.session_id); store.set('vpl:index', idx); }
  }
  function deviceId() {
    let d = store.get('vpl:device');
    if (!d) { d = uuid(); store.set('vpl:device', d); }
    return d;
  }
  function newSession(pidNum) {
    T0 = Date.now();
    S = {
      schema: SCHEMA, app_version: APP_VERSION, plan_version: PLAN.plan_version, plan_built_at: PLAN.built_at,
      manifest_sha256: PLAN.manifest_sha256, field_build: PLAN.field_build, session_id: uuid(), device_id: deviceId(),
      panel: PLAN.panel, stim_region: PLAN.stim_region, pid: params.get('pid'), pid_num: pidNum, mode, retest, assisted,
      ui_lang: lang, consent_version: CONSENT_VERSION, started_at: new Date().toISOString(), finished_at: null,
      complete: false, end_reason: null, consent: null, screen: null, check: { rounds: [], pass: null },
      trials: [], open_text: '', stage: 'welcome', idx: 0, t0: T0, ua: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight], restarted_from: null, stalls: 0,
    };
  }

  // ===== Audio =====
  let watchdog = null;
  function clipUrl(code, ch) {
    const c = PLAN.clips[code];
    if (!c) throw new Error('clip not in plan: ' + code);
    return (ch === 'wb' && c.wb) ? c.wb : c.ph;
  }
  function playUrl(url, durS, onEnd, onStuck) {
    const p = player();
    clearTimeout(watchdog);
    let done = false;
    const end = (fn) => { if (done) return; done = true; clearTimeout(watchdog); p.onplaying = null; fn(); };
    p.onended = () => end(onEnd);
    p.onerror = () => end(() => onStuck('error'));
    // Slow mobile data: allow 45 s to start, then re-arm on every 'playing' (it fires again after buffering).
    p.onplaying = () => {
      clearTimeout(watchdog);
      const left = Math.max(0, (durS || 15) - (p.currentTime || 0));
      watchdog = setTimeout(() => end(() => { p.pause(); onStuck('timeout'); }), (left / speed + 6) * 1000);
    };
    p.src = url;
    p.playbackRate = speed;
    p.defaultPlaybackRate = speed;
    const pr = p.play();
    if (pr && pr.catch) pr.catch(() => end(() => onStuck('blocked')));
    watchdog = setTimeout(() => end(() => { p.pause(); onStuck('load_timeout'); }), 45000);
  }
  function stopAudio() { clearTimeout(watchdog); const p = player(); p.onended = null; p.onerror = null; p.onplaying = null; try { p.pause(); } catch (e) { /* */ } }
  const prefetched = [];
  function prefetch(urls) {
    for (const u of urls) { const a = new Audio(); a.preload = 'auto'; a.src = u; prefetched.push(a); }
    while (prefetched.length > 8) prefetched.shift();
  }
  function beepWav(n, rng) {            // n beeps of 1 kHz at -20 dBFS, irregular gaps; returns {url, dur}
    const sr = 16000, beep = 0.15, parts = [0.4];
    for (let i = 0; i < n; i++) parts.push(beep, 0.3 + rng() * 0.45);
    const total = parts.reduce((x, y) => x + y, 0) + 0.3;
    const N = Math.floor(total * sr), data = new Int16Array(N);
    let tpos = parts[0];
    for (let i = 0; i < n; i++) {
      const s0 = Math.floor(tpos * sr), len = Math.floor(beep * sr);
      for (let j = 0; j < len; j++) {
        const env = Math.min(1, j / 160, (len - j) / 160);
        data[s0 + j] = Math.round(0.1 * 32767 * env * Math.sin(2 * Math.PI * 1000 * j / sr));
      }
      tpos += parts[1 + 2 * i] + parts[2 + 2 * i];
    }
    const buf = new ArrayBuffer(44 + N * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + N * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, N * 2, true);
    for (let i = 0; i < N; i++) v.setInt16(44 + i * 2, data[i], true);
    return { url: URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })), dur: total };
  }

  // ===== Rendering helpers =====
  function screen(...kids) {
    const root = app();
    root.replaceChildren();
    if (mode === 'pilot') root.append(h('div', { class: 'banner' }, t('pilot_banner')));
    if (mode === 'test') root.append(h('div', { class: 'banner' }, t('test_banner')));
    if (!store.ok) root.append(h('div', { class: 'banner warn' }, t('storage_warn')));
    root.append(...kids);
    window.scrollTo(0, 0);
  }
  function choiceGroup(name, options, value, onPick, opts = {}) {
    const wrap = h('div', { class: 'choices' + (opts.row ? ' row' : '') + (opts.cls ? ' ' + opts.cls : ''), role: 'radiogroup', 'data-q': name });
    for (const [val, label] of options) {
      const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(value === val), 'data-v': val }, label);
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(val);
      });
      wrap.append(b);
    }
    return wrap;
  }
  function agreeRow(name, label, value, onPick) {
    const opts = [1, 2, 3, 4, 5, 6, 7].map((n) => [n, String(n)]);
    return h('div', { class: 'q' }, h('p', { class: 'qtext' }, label),
      choiceGroup(name, opts, value, onPick, { row: true, cls: 'seven' }),
      h('div', { class: 'ends' }, h('span', {}, t('agree_lo')), h('span', {}, t('agree_hi'))));
  }
  function labelledScale(name, label, labels, value, onPick) {
    return h('div', { class: 'q' }, h('p', { class: 'qtext' }, label),
      choiceGroup(name, labels.map((l, i) => [i + 1, `${i + 1}  ${l}`]), value, onPick, { cls: 'scale' }));
  }
  function primary(label, onClick, disabled) {
    return h('button', { type: 'button', class: 'btn primary', disabled: disabled ? true : null, onclick: onClick }, label);
  }

  // ===== Flow =====
  function go(stage, idx) { S.stage = stage; S.idx = idx || 0; save(); render(); }
  function render() {
    stopAudio();
    const st = S.stage;
    if (st === 'welcome') return renderWelcome();
    if (st === 'consent') return renderConsent();
    if (st === 'screen') return renderScreening();
    if (st === 'check') return renderCheck();
    if (st === 'introC' || st === 'introB' || st === 'introA') return renderIntro(st.slice(-1));
    if (st === 'C' || st === 'B' || st === 'A') return renderTrial(st);
    if (st === 'close') return renderClose();
    if (st === 'done') return renderDone();
    return renderEnded();
  }
  const blocks = () => (retest ? ['A'] : (SCHED.C.length ? ['C', 'B', 'A'] : ['B', 'A']));
  function nextBlock(after) {
    const b = blocks(), i = after ? b.indexOf(after) + 1 : 0;
    if (i < b.length) return go('intro' + b[i]);
    return retest ? finish() : go('close');
  }
  function partNumber(block) { return blocks().indexOf(block) + 1; }
  function trialsOf(block) {
    if (block !== 'A' || !retest) return SCHED[block];
    return SCHED.Ar.map((i) => SCHED.A[i]);
  }

  function renderWelcome() {
    const langPick = h('div', { class: 'langs' }, Object.entries(LANGS).map(([k, v]) =>
      h('button', { type: 'button', class: 'choice', 'aria-pressed': String(k === lang), onclick: () => { lang = k; S.ui_lang = k; save(); render(); } }, v)));
    screen(h('h1', {}, t('title')), langPick, h('h2', {}, t('welcome_h')),
      retest ? h('p', {}, t('retest_p')) : t('welcome_p').map((p) => h('p', {}, p)),
      primary(t('start'), () => go('consent')));
  }
  function renderConsent() {
    const vars = { owner: CONFIG.owner, contact: CONFIG.contact, amount: CONFIG.amount, months: CONFIG.retention_months, pid: S.pid };
    screen(h('h2', {}, t('consent_h')), h('div', { class: 'consent' }, t('consent').map((p) => h('p', {}, p.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))))),
      primary(t('consent_yes'), () => {
        S.consent = { given: true, at: new Date().toISOString(), version: CONSENT_VERSION, lang };
        go(retest ? 'check' : 'screen');
      }),
      h('button', { type: 'button', class: 'btn', onclick: () => {
        const sid = S.session_id; store.del('vpl:s:' + sid);
        const idx = (store.get('vpl:index') || []).filter((x) => x !== sid); store.set('vpl:index', idx);
        S = null; app().replaceChildren(h('p', { class: 'end' }, t('declined')));
      } }, t('consent_no')));
  }
  function renderScreening() {
    const a = S.screen_draft || { other_langs: [] };
    const set = (k) => (v) => { a[k] = v; S.screen_draft = a; save(); };
    const sel = (k, opts) => opts.map(([v, l]) => [v, lbl(l)]);
    const msg = h('p', { class: 'error', role: 'alert' });
    const multi = h('div', { class: 'choices compact', 'data-q': 'other_langs' }, OPT.lang.map(([v, l]) => {
      const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': String(a.other_langs.includes(v)), 'data-v': v }, lbl(l));
      b.addEventListener('click', () => {
        const on = !a.other_langs.includes(v);
        a.other_langs = on ? a.other_langs.concat(v) : a.other_langs.filter((x) => x !== v);
        b.setAttribute('aria-pressed', String(on)); S.screen_draft = a; save();
      });
      return b;
    }));
    const district = h('input', { type: 'text', maxlength: '60', value: a.home_district || '', 'data-q': 'home_district', autocomplete: 'off' });
    district.addEventListener('input', () => { a.home_district = district.value.trim(); S.screen_draft = a; save(); });
    const yn = [['yes', t('yes')], ['no', t('no')]];
    const block = (label, el) => h('div', { class: 'q' }, h('p', { class: 'qtext' }, label), el);
    screen(h('h2', {}, t('screen_h')), h('p', { class: 'muted' }, t('screen_p')),
      block(t('q_age'), choiceGroup('age', sel('age', OPT.age), a.age, set('age'))),
      block(t('q_gender'), choiceGroup('gender', sel('gender', OPT.gender), a.gender, set('gender'))),
      block(t('q_home_state'), choiceGroup('home_state', sel('state', OPT.state), a.home_state, set('home_state'), { cls: 'compact' })),
      block(t('q_home_district'), district),
      block(t('q_cur_state'), choiceGroup('cur_state', sel('state', OPT.state.concat(OPT.abroad)), a.cur_state, set('cur_state'), { cls: 'compact' })),
      block(t('q_place'), choiceGroup('place', sel('place', OPT.place), a.place, set('place'))),
      block(t('q_mt'), choiceGroup('mt', sel('lang', OPT.lang), a.mt, set('mt'), { cls: 'compact' })),
      block(t('q_home_lang'), choiceGroup('home_lang', sel('lang', OPT.lang), a.home_lang, set('home_lang'), { cls: 'compact' })),
      block(t('q_other_langs'), multi),
      block(t('q_edu'), choiceGroup('edu', sel('edu', OPT.edu), a.edu, set('edu'))),
      block(t('q_phone'), choiceGroup('phone', sel('phone', OPT.phone), a.phone, set('phone'), { row: true })),
      block(t('q_device'), choiceGroup('device', sel('device', OPT.device), a.device, set('device'))),
      block(t('q_work'), choiceGroup('work', yn, a.work, set('work'), { row: true })),
      block(t('q_know'), choiceGroup('know', yn, a.know, set('know'), { row: true })),
      block(t('q_before'), choiceGroup('before', yn, a.before, set('before'), { row: true })),
      msg,
      primary(t('next'), () => {
        const need = ['age', 'gender', 'home_state', 'home_district', 'cur_state', 'place', 'mt', 'home_lang', 'edu', 'phone', 'device', 'work', 'know', 'before'];
        if (need.some((k) => !a[k])) { msg.textContent = t('required'); return; }
        let reason = null;
        if (a.age === 'under18') reason = 'age';
        else if (a.work === 'yes') reason = 'occupation';
        else if (a.know === 'yes') reason = 'knows_team';
        else if (a.before === 'yes') reason = 'repeat';
        else reason = ELIG[S.panel](a);
        if (reason) {
          // Keep only the reason code, for screen-out counts. Under-18 answers are not kept at all.
          S.screen = null; delete S.screen_draft;
          S.end_reason = 'screened_out:' + reason; S.finished_at = new Date().toISOString();
          if (reason === 'age') { store.del('vpl:s:' + S.session_id); S = null; app().replaceChildren(h('p', { class: 'end' }, t('screened_out'))); return; }
          return go('ended');
        }
        S.screen = Object.assign({}, a); delete S.screen_draft;
        go('check');
      }));
  }

  function renderCheck() {
    const round = S.check.rounds.length;
    if (S.check.rounds.filter((r) => r.ok).length >= 2) { S.check.pass = true; return nextBlock(null); }
    if (round >= 4) { S.check.pass = false; S.end_reason = 'playback_check_failed'; S.finished_at = new Date().toISOString(); return go('ended'); }
    const rng = rngFrom(S.session_id + '|beep|' + round);
    let n = 3 + Math.floor(rng() * 5);
    if (round > 0 && n === S.check.rounds[round - 1].n) n = n === 7 ? 3 : n + 1;
    const wav = beepWav(n, rng);
    if (mode === 'test') window.__vpl.beeps = n;
    const status = h('p', { class: 'status', 'aria-live': 'polite' });
    const answers = h('div', { class: 'choices row nine', hidden: true }, [2, 3, 4, 5, 6, 7, 8].map((k) =>
      h('button', { type: 'button', class: 'choice', 'data-v': k, onclick: () => {
        const ok = k === n;
        S.check.rounds.push({ n, answer: k, ok, at: ms(), device: (S.screen || {}).device || null });
        save();
        if (!ok) { status.textContent = t('check_retry'); answers.hidden = true; setTimeout(render, 1400); return; }
        render();
      } }, String(k))));
    const btn = primary(t('check_play'), () => {
      btn.disabled = true; status.textContent = t('playing');
      playUrl(wav.url, wav.dur, () => { status.textContent = t('check_q'); answers.hidden = false; },
        () => { btn.disabled = false; status.textContent = t('audio_stuck'); });
    });
    screen(h('h2', {}, t('check_h')), h('p', {}, t('check_p')), btn, status, answers);
  }

  function renderIntro(block) {
    const n = trialsOf(block).length;
    const head = t('intro' + block + '_h', { part: partNumber(block) });
    const body = t('intro' + block + '_p', { n, part: partNumber(block) });
    const first = trialsOf(block)[0];
    if (first) prefetch(urlsOf(first));
    screen(h('h2', {}, head), h('p', {}, body), primary(t('begin'), () => go(block, 0)));
  }
  function urlsOf(e) {
    if (e[0] === 'p') return [clipUrl(e[2], e[4]), clipUrl(e[3], e[4])];
    if (e[0] === 'i') return [clipUrl(e[1], e[2])];
    return [clipUrl(e[1], 'ph')];
  }

  function renderTrial(block) {
    const list = trialsOf(block);
    const i = S.idx;
    if (i >= list.length) return nextBlock(block);
    const e = list[i];
    if (list[i + 1]) prefetch(urlsOf(list[i + 1]));
    const rec = { block, pos: i, kind: { r: 'rate', d: 'degraded', p: 'pair', i: 'identical', c: 'human_or_ai' }[e[0]], t_shown: ms(), plays: 0, stalls: 0 };
    if (S.resume_at && S.resume_at.stage === block && S.resume_at.idx === i) rec.after_resume = 1;   // possible second hearing
    if (e[0] === 'p') Object.assign(rec, { pair: e[1], a: e[2], b: e[3], ch: e[4], turn: PLAN.clips[e[2]].t });
    else if (e[0] === 'i') Object.assign(rec, { pair: 'identical', a: e[1], b: e[1], ch: e[2], turn: PLAN.clips[e[1]].t });
    else Object.assign(rec, { clip: e[1], ch: 'ph', turn: PLAN.clips[e[1]].t, attn_row: e[0] === 'r' ? e[2] : 0 });
    if (block === 'A') return renderPair(rec, list.length);
    return renderSingle(rec, list.length, block);
  }
  function commit(rec) { rec.t_answer = ms(); S.trials.push(rec); S.idx += 1; save(); render(); }

  function renderSingle(rec, N, block) {
    const ans = {};
    const next = primary(t('next'), () => commit(Object.assign(rec, ans)), true);
    const qwrap = h('div', { hidden: true });
    const status = h('p', { class: 'status', 'aria-live': 'polite' });
    const required = [];
    const done = () => { next.disabled = required.some((k) => ans[k] === undefined); };
    const pick = (k) => (v) => { ans[k] = v; done(); };
    const rng = rngFrom(S.session_id + '|' + block + '|' + rec.pos);
    if (block === 'C') {
      required.push('hai', 'conf', 'nat', 'cont');
      qwrap.append(
        h('div', { class: 'q' }, h('p', { class: 'qtext' }, t('q_hai')), choiceGroup('hai', [['human', t('hai_h')], ['computer', t('hai_c')]], null, pick('hai'))),
        h('div', { class: 'q' }, h('p', { class: 'qtext' }, t('q_conf')), choiceGroup('conf', t('conf').map((l, j) => [j + 1, l]), null, pick('conf'), { row: true })),
        labelledScale('nat', t('q_nat'), t('nat'), null, pick('nat')),
        labelledScale('cont', t('q_cont'), t('cont'), null, pick('cont')));
    } else {
      const comp = COMP[rec.turn] || [];
      const cq = comp.map((c, j) => {
        const key = 'q' + (j + 1); required.push(key);
        const order = shuffled(['a', 'b', 'c', 'd'], rng);
        rec[key + '_order'] = order.join('');
        return h('div', { class: 'q' }, h('p', { class: 'qtext' }, lbl(c.q)), choiceGroup(key, order.map((o) => [o, lbl(c[o])]), null, pick(key)));
      });
      const rows = [labelledScale('nat', t('q_nat'), t('nat'), null, pick('nat')),
        agreeRow('trust', t('q_trust'), null, pick('trust')),
        agreeRow('patr', t('q_patr'), null, pick('patr')),
        agreeRow('fit', t('q_fit'), null, pick('fit')),
        labelledScale('cont', t('q_cont'), t('cont'), null, pick('cont'))];
      required.push('nat', 'trust', 'patr', 'fit', 'cont');
      if (rec.attn_row) { rows.splice(1 + Math.floor(rng() * 3), 0, agreeRow('attn', t('attn'), null, pick('attn'))); required.push('attn'); }
      qwrap.append(cq.length ? h('h3', {}, t('comp_h')) : null, ...cq, h('hr'), ...rows);
    }
    const url = clipUrl(rec.clip, 'ph'), dur = PLAN.clips[rec.clip].d;
    const playBtn = primary(t('play_call'), () => {
      playBtn.disabled = true; status.textContent = t('playing'); rec.plays += 1;
      if (rec.t_play === undefined) rec.t_play = ms();
      playUrl(url, dur, () => {
        rec.t_end = ms(); status.textContent = t('played'); playBtn.hidden = true; qwrap.hidden = false; done();
      }, (why) => {
        rec.stalls += 1; S.stalls += 1; rec.stall_reason = why; playBtn.disabled = false; playBtn.textContent = t('audio_stuck'); status.textContent = '';
      });
    });
    screen(h('p', { class: 'progress' }, t('call_n', { n: rec.pos + 1, N })), h('div', { class: 'player-card' }, playBtn, status), qwrap,
      h('div', { class: 'footer' }, next));
  }

  function renderPair(rec, N) {
    let choice = null, heardA = false, heardB = false;
    rec.plays_a = 0; rec.plays_b = 0;
    const next = primary(t('next'), () => commit(Object.assign(rec, { choice })), true);
    const tileA = h('div', { class: 'tile' }, t('caller_a')), tileB = h('div', { class: 'tile' }, t('caller_b'));
    const status = h('p', { class: 'status', 'aria-live': 'polite' });
    const after = h('div', { hidden: true });
    const urlA = clipUrl(rec.a, rec.ch), urlB = clipUrl(rec.b, rec.ch);
    const dA = PLAN.clips[rec.a].d, dB = PLAN.clips[rec.b].d;
    const lock = (on) => { [playBoth, reA, reB].forEach((b) => { b.disabled = on; }); };
    const stuck = (why) => { rec.stalls += 1; S.stalls += 1; rec.stall_reason = why; tileA.classList.remove('on'); tileB.classList.remove('on'); lock(false); playBoth.hidden = false; playBoth.textContent = t('audio_stuck'); status.textContent = ''; };
    const one = (which, then) => {
      const tile = which === 'a' ? tileA : tileB;
      tile.classList.add('on'); rec['plays_' + which] += 1;
      playUrl(which === 'a' ? urlA : urlB, which === 'a' ? dA : dB, () => { tile.classList.remove('on'); then(); }, stuck);
    };
    const reveal = () => { if (heardA && heardB) { rec.t_end = rec.t_end || ms(); after.hidden = false; playBoth.hidden = true; status.textContent = ''; next.disabled = choice === null; } lock(false); };
    const playBoth = primary(t('play_both'), () => {
      lock(true); rec.plays += 1; if (rec.t_play === undefined) rec.t_play = ms(); status.textContent = t('playing');
      one('a', () => { heardA = true; setTimeout(() => one('b', () => { heardB = true; reveal(); }), 700); });
    });
    const reA = h('button', { type: 'button', class: 'btn', onclick: () => { lock(true); one('a', reveal); } }, t('replay_a'));
    const reB = h('button', { type: 'button', class: 'btn', onclick: () => { lock(true); one('b', reveal); } }, t('replay_b'));
    const prefOpts = ['A2', 'A1', '0', 'B1', 'B2'].map((k) => [k, t('pref')[k]]);
    after.append(h('div', { class: 'replays' }, reA, reB), h('p', { class: 'qtext' }, t('q_pref')),
      choiceGroup('pref', prefOpts, null, (v) => { choice = v; next.disabled = false; }, { cls: 'pref' }));
    screen(h('p', { class: 'progress' }, t('pair_n', { n: rec.pos + 1, N })), h('div', { class: 'tiles' }, tileA, tileB),
      playBoth, status, after, h('div', { class: 'footer' }, next));
  }

  function renderClose() {
    const ta = h('textarea', { rows: '4', maxlength: '1000', placeholder: t('close_ph'), 'data-q': 'open_text' }, S.open_text || '');
    ta.addEventListener('input', () => { S.open_text = ta.value; save(); });
    screen(h('h2', {}, t('close_h')), h('p', { class: 'qtext' }, t('close_q')), ta, primary(t('finish'), finish));
  }
  function canonical(s) {        // must match analysis.py canonical(): fixed key order, fields frozen at finish
    return JSON.stringify({ session_id: s.session_id, panel: s.panel, pid: s.pid, retest: s.retest, screen: s.screen,
      check: s.check, trials: s.trials, open_text: s.open_text, finished_at: s.finished_at });
  }
  function finish() {
    S.complete = true; S.finished_at = new Date().toISOString(); S.stage = 'done';
    S.checksum = fnv1a(canonical(S));
    save(); render();
  }

  // ===== Export =====
  function exportObj(s) { const o = Object.assign({}, s); delete o.screen_draft; return o; }
  const CSV_COLS = ['session_id', 'panel', 'pid', 'pid_num', 'mode', 'retest', 'assisted', 'ui_lang', 'started_at', 'finished_at', 'complete', 'end_reason',
    'age', 'gender', 'home_state', 'home_district', 'cur_state', 'place', 'mt', 'home_lang', 'other_langs', 'edu', 'phone', 'device',
    'check_pass', 'block', 'pos', 'kind', 'pair', 'clip', 'a', 'b', 'ch', 'turn', 'choice', 'q1', 'q2', 'q1_order', 'q2_order',
    'nat', 'trust', 'patr', 'fit', 'cont', 'attn_row', 'attn', 'hai', 'conf', 'plays', 'plays_a', 'plays_b', 'stalls', 'after_resume',
    't_shown', 't_play', 't_end', 't_answer', 'open_text', 'device_id', 'app_version', 'plan_version', 'manifest_sha256', 'checksum'];
  function toCsv(sessions) {
    const esc = (v) => { if (v === undefined || v === null) return ''; const s = Array.isArray(v) ? v.join('|') : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [CSV_COLS.join(',')];
    for (const s of sessions) {
      const base = Object.assign({}, s, s.screen || {}, { check_pass: s.check && s.check.pass });
      const rows = (s.trials && s.trials.length) ? s.trials : [{}];
      rows.forEach((tr, k) => {
        const row = Object.assign({}, base, tr, { open_text: k === 0 ? s.open_text : '' });
        lines.push(CSV_COLS.map((c) => esc(row[c])).join(','));
      });
    }
    return lines.join('\r\n') + '\r\n';
  }
  function b64url(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function answerCode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) {
      try {
        const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        const gz = new Uint8Array(await new Response(cs).arrayBuffer());
        return 'VPL1z.' + b64url(gz);
      } catch (e) { /* fall through */ }
    }
    return 'VPL1.' + b64url(bytes);
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  function fileBase(s) { return `vpl_${s.panel}_${s.pid || 'nopid'}${s.retest ? '_retest' : ''}_${stamp()}`; }

  async function renderDone() {
    const obj = exportObj(S);
    const json = JSON.stringify(obj, null, 1);
    const code = await answerCode(obj);
    const msg = h('p', { class: 'status', 'aria-live': 'polite' });
    const codeBox = h('textarea', { class: 'code', rows: '3', readonly: true, 'data-q': 'answer_code' }, code);
    const voices = SCHED.C.length && !retest ? t('voices_mixed') : t('voices_tts');
    const share = async () => {
      const file = typeof File === 'function' ? new File([json], fileBase(S) + '.json', { type: 'application/json' }) : null;
      try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'VPL ' + S.pid, text: S.pid + ' ' + S.checksum }); S.sent_via = 'share_file'; save(); return; }
        if (navigator.share) { await navigator.share({ title: 'VPL ' + S.pid, text: code }); S.sent_via = 'share_text'; save(); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      copy();
    };
    const copy = async () => {
      try { await navigator.clipboard.writeText(code); msg.textContent = t('copied'); S.sent_via = S.sent_via || 'copy'; save(); }
      catch (e) { codeBox.focus(); codeBox.select(); msg.textContent = t('copy_fail'); }
    };
    screen(h('h2', {}, t('done_h')), h('p', {}, t('debrief', { voices })),
      h('p', { class: 'callout' }, t('completion', { code: S.checksum })), h('p', {}, t('payment', { amount: CONFIG.amount })),
      h('h3', {}, t('send_h')), h('p', {}, t('send_p')),
      primary(t('send_share'), share),
      h('button', { type: 'button', class: 'btn', onclick: () => download(fileBase(S) + '.json', json, 'application/json') }, t('send_download')),
      h('button', { type: 'button', class: 'btn', onclick: () => download(fileBase(S) + '.csv', toCsv([obj]), 'text/csv') }, t('send_csv')),
      h('button', { type: 'button', class: 'btn', onclick: copy }, t('send_copy')), msg, codeBox);
    if (mode === 'test') window.__vpl.done = { json, code, csv: toCsv([obj]) };
  }
  function renderEnded() {
    const r = S.end_reason || '';
    screen(h('p', { class: 'end' }, r === 'playback_check_failed' ? t('check_fail') : t('screened_out')));
  }

  // ===== Coordinator view =====
  function renderCoordinator() {
    lang = lang || 'en';
    const idx = store.get('vpl:index') || [];
    const sessions = idx.map((id) => store.get('vpl:s:' + id)).filter(Boolean).map(exportObj);
    const rows = sessions.map((s) => h('tr', {}, h('td', {}, s.panel), h('td', {}, s.pid || ''), h('td', {}, s.mode + (s.retest ? ' retest' : '')),
      h('td', {}, s.complete ? 'complete' : (s.end_reason || 'in progress')), h('td', {}, (s.finished_at || s.saved_at || '').slice(0, 16)), h('td', {}, s.checksum || '')));
    app().replaceChildren(h('h2', {}, t('coordinator_h')),
      sessions.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['panel', 'pid', 'mode', 'status', 'time', 'code'].map((x) => h('th', {}, x)))), h('tbody', {}, rows))) : h('p', {}, t('none_saved')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => download(`vpl_device_${stamp()}.json`, JSON.stringify(sessions, null, 1), 'application/json') }, t('export_json')),
      h('button', { type: 'button', class: 'btn', onclick: () => download(`vpl_device_${stamp()}.csv`, toCsv(sessions), 'text/csv') }, t('export_csv')),
      h('button', { type: 'button', class: 'btn danger', onclick: () => {
        if (!window.confirm(t('clear_confirm'))) return;
        idx.forEach((id) => store.del('vpl:s:' + id)); store.del('vpl:index'); renderCoordinator();
      } }, t('clear')));
  }

  // ===== Boot =====
  function fail(key, detail) {
    lang = lang || 'en';
    app().replaceChildren(h('p', { class: 'end' }, t(key)), detail ? h('p', { class: 'muted small' }, detail) : null);
  }
  function configured() { return ![CONFIG.owner, CONFIG.contact].some((x) => /^\[/.test(String(x))) && Number(CONFIG.amount) > 0; }
  function boot() {
    if (mode === 'test') window.__vpl = { get S() { return S; }, get PLAN() { return PLAN; } };
    store.ok = probeStorage();
    if (params.get('coordinator') === '1') return renderCoordinator();
    const panel = params.get('panel');
    if (!PANELS.includes(panel)) return fail('bad_link', 'panel');
    const s = document.createElement('script');
    s.src = 'plans/' + panel + '.js';
    s.onerror = () => fail('bad_link', 'plan file missing: plans/' + panel + '.js');
    s.onload = () => {
      if (!PLAN || PLAN.panel !== panel) return fail('bad_link', 'plan');
      lang = lang || PLAN.default_lang;
      document.documentElement.lang = lang;
      if (mode !== 'test' && !configured()) return fail('not_configured');
      const pid = (params.get('pid') || '').toUpperCase();
      const m = pid.match(/^([A-Z])(\d{1,4})$/);
      if (!m || m[1] !== PLAN.prefix || +m[2] < 1 || +m[2] > PLAN.schedules.length) return fail('bad_link', 'pid');
      SCHED = PLAN.schedules[+m[2] - 1];
      if (!SCHED || SCHED.n !== +m[2]) return fail('bad_link', 'schedule');
      const idx = store.get('vpl:index') || [];
      const open = idx.map((id) => store.get('vpl:s:' + id)).filter((x) => x && x.panel === panel && x.pid === pid && !!x.retest === retest && !x.complete && !x.end_reason && x.stage !== 'welcome');
      const latest = open.sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1))[0];
      if (latest) {
        screen(h('p', {}, t('resume_q')),
          primary(t('resume_yes'), () => {
            S = latest; lang = S.ui_lang || lang; T0 = Date.now() - (S.t_elapsed || 0);
            S.resumed = (S.resumed || 0) + 1; S.resume_at = { stage: S.stage, idx: S.idx };
            render();
          }),
          h('button', { type: 'button', class: 'btn', onclick: () => { newSession(+m[2]); S.restarted_from = latest.session_id; S.pid = pid; save(); render(); } }, t('resume_no')));
        return;
      }
      newSession(+m[2]);
      S.pid = pid;
      render();
    };
    document.head.append(s);
  }
  window.addEventListener('pagehide', () => { if (S) { S.t_elapsed = ms(); save(); } });
  document.addEventListener('visibilitychange', () => { if (S && document.visibilityState === 'hidden') { S.t_elapsed = ms(); save(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
