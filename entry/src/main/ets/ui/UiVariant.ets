// UI-only build switch. Set false and run again to restore the original screens.
export const USE_EDITORIAL_UI: boolean = true;
export const UI_INDEX_PAGE: string = USE_EDITORIAL_UI ? 'ui/editorial/pages/Index' : 'pages/Index';
export const UI_MAIN_PAGE: string = USE_EDITORIAL_UI ? 'ui/editorial/pages/Main' : 'pages/Main';
export const UI_LEGAL_PAGE: string = USE_EDITORIAL_UI ? 'ui/editorial/pages/LegalDocument' : 'pages/LegalDocument';
