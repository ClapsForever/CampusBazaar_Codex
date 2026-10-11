import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window, KeyboardAvoidMode } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Keep the bottom navigation above the system gesture area and resize for input.
    windowStage.getMainWindowSync().setWindowLayoutFullScreen(false);
    windowStage.loadContent('pages/Index', () => {
      windowStage.getMainWindowSync().getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    });
  }

  onWindowStageDestroy(): void {
  }
}
