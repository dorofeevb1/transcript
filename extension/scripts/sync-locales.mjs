#!/usr/bin/env node
/**
 * Copies en/messages.json to uk, de, es, fr and applies locale overrides.
 * Run: node scripts/sync-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '_locales');
const en = JSON.parse(fs.readFileSync(path.join(root, 'en', 'messages.json'), 'utf8'));

const overrides = {
  uk: {
    extName: 'Стенограма відео',
    extDesc:
      'Повний текст відео з YouTube, Rutube та VK. За хвилинами та фразами. Безкоштовно.',
    brandTitle: 'Стенограма',
    openVideoPrompt: 'Відкрийте відео на підтримуваному сайті',
    statusOpenVideo: 'Відкрийте сторінку з відео',
    history: 'Історія',
    clearHistory: 'Очистити',
    historyEmpty: 'Ще немає збережених стенограм',
    source: 'Джерело',
    captionsMode: 'Субтитри відео',
    sttMode: 'З аудіо (Whisper)',
    display: 'Відображення',
    viewMinutes: 'За хвилинами',
    viewPhrases: 'За фразами',
    fetchText: 'Отримати текст',
    cancel: 'Скасувати',
    translate: 'Переклад',
    language: 'Мова',
    apply: 'Застосувати',
    copy: 'Копіювати',
    settingsTitle: 'Налаштування',
    fetchText: 'Отримати текст',
    langOriginal: 'Оригінал',
    optionsSave: 'Зберегти налаштування',
    optionsSaved: 'Налаштування збережено',
    phaseDone: 'Готово',
    phaseError: 'Помилка',
  },
  de: {
    extName: 'Video-Transkript',
    extDesc:
      'Volltext von YouTube-, Rutube- und VK-Videos. Nach Minuten und Sätzen. Kostenlos.',
    brandTitle: 'Transkript',
    openVideoPrompt: 'Video auf einer unterstützten Seite öffnen',
    statusOpenVideo: 'Videoseite öffnen',
    history: 'Verlauf',
    clearHistory: 'Leeren',
    historyEmpty: 'Noch keine gespeicherten Transkripte',
    source: 'Quelle',
    captionsMode: 'Videountertitel',
    sttMode: 'Aus Audio (Whisper)',
    display: 'Anzeige',
    viewMinutes: 'Nach Minute',
    viewPhrases: 'Nach Satz',
    fetchText: 'Text abrufen',
    cancel: 'Abbrechen',
    translate: 'Übersetzung',
    language: 'Sprache',
    apply: 'Anwenden',
    copy: 'Kopieren',
    settingsTitle: 'Einstellungen',
    langOriginal: 'Original',
    optionsSave: 'Einstellungen speichern',
    optionsSaved: 'Einstellungen gespeichert',
    phaseDone: 'Fertig',
    phaseError: 'Fehler',
  },
  es: {
    extName: 'Transcripción de video',
    extDesc:
      'Texto completo de videos de YouTube, Rutube y VK. Por minutos y frases. Gratis.',
    brandTitle: 'Transcripción',
    openVideoPrompt: 'Abra un video en un sitio compatible',
    statusOpenVideo: 'Abra la página del video',
    history: 'Historial',
    clearHistory: 'Borrar',
    historyEmpty: 'Aún no hay transcripciones guardadas',
    source: 'Fuente',
    captionsMode: 'Subtítulos del video',
    sttMode: 'Desde audio (Whisper)',
    display: 'Vista',
    viewMinutes: 'Por minuto',
    viewPhrases: 'Por frase',
    fetchText: 'Obtener texto',
    cancel: 'Cancelar',
    translate: 'Traducción',
    language: 'Idioma',
    apply: 'Aplicar',
    copy: 'Copiar',
    settingsTitle: 'Ajustes',
    langOriginal: 'Original',
    optionsSave: 'Guardar ajustes',
    optionsSaved: 'Ajustes guardados',
    phaseDone: 'Listo',
    phaseError: 'Error',
  },
  fr: {
    extName: 'Transcription vidéo',
    extDesc:
      'Texte intégral des vidéos YouTube, Rutube et VK. Par minute et par phrase. Gratuit.',
    brandTitle: 'Transcription',
    openVideoPrompt: 'Ouvrez une vidéo sur un site pris en charge',
    statusOpenVideo: 'Ouvrez la page vidéo',
    history: 'Historique',
    clearHistory: 'Effacer',
    historyEmpty: 'Aucune transcription enregistrée',
    source: 'Source',
    captionsMode: 'Sous-titres vidéo',
    sttMode: 'Depuis l’audio (Whisper)',
    display: 'Affichage',
    viewMinutes: 'Par minute',
    viewPhrases: 'Par phrase',
    fetchText: 'Obtenir le texte',
    cancel: 'Annuler',
    translate: 'Traduction',
    language: 'Langue',
    apply: 'Appliquer',
    copy: 'Copier',
    settingsTitle: 'Paramètres',
    langOriginal: 'Original',
    optionsSave: 'Enregistrer',
    optionsSaved: 'Paramètres enregistrés',
    phaseDone: 'Terminé',
    phaseError: 'Erreur',
  },
};

for (const [locale, patch] of Object.entries(overrides)) {
  const out = structuredClone(en);
  for (const [key, message] of Object.entries(patch)) {
    if (out[key]) out[key] = { ...out[key], message };
  }
  const dir = path.join(root, locale);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'messages.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote', locale);
}
