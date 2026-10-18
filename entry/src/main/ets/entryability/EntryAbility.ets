import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Keep the bottom navigation above the system gesture area.
    windowStage.getMainWindowSync().setWindowLayoutFullScreen(false).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'EntryAbility', 'Failed to set window layout: %{public}s', error.message);
    });
    windowStage.loadContent('pages/Index', (error: BusinessError) => {
      if (error.code) {
        hilog.error(0x0000, 'EntryAbility', 'Failed to load login page: %{public}s', error.message);
      }
    });
  }

  onWindowStageDestroy(): void {
  }
}
