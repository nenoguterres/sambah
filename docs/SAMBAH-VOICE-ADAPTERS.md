# SAMBAH-VOICE-ADAPTERS

## Adapters simulados implementados

- `MockWhatsappAdapter` como `mock-whatsapp.adapter`.
- `MockSttAdapter` como `mock-stt.adapter`.
- `MockTtsAdapter` como `mock-tts.adapter`.
- `MockAiIntentAdapter` como `mock-ai-intent.adapter`.
- `MockHumanHandoffAdapter` como `mock-human-handoff.adapter`.

## Adapters futuros preparados

- WhatsApp Cloud API.
- Twilio.
- Z-API.
- Take Blip.
- Azure Speech.
- Google Speech.
- OpenAI STT.
- AWS Transcribe.

## Contratos esperados

- WhatsApp: receber midia, enviar texto, enviar audio.
- STT: converter audio em texto com confianca e idioma.
- TTS: converter resposta em audio.
- Intent: transformar texto em intent, entidades e necessidade de confirmacao.
- Handoff: abrir atendimento humano e devolver status/ticket.
