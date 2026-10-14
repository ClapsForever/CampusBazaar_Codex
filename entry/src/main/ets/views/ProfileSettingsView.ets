import { User } from '../model/Models';
import { ProfileViewModel } from '../viewmodel/ProfileViewModel';
import {
  CIRCLE_RADIUS, UI_RADIUS, COLOR_ERROR, COLOR_PAGE_BG, COLOR_PRIMARY, COLOR_PRIMARY_SOFT,
  COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY
} from '../common/Constants';

@ComponentV2
export struct ProfileSettingsView {
  @Local vm: ProfileViewModel = new ProfileViewModel();
  @Event onUserChanged: (user: User) => void = (_user: User): void => {};
  @Event onClose: () => void = (): void => {};

  aboutToAppear(): void { this.vm.load(); }
  aboutToDisappear(): void { this.vm.clearPasswords(); }

  build() {
    Column({ space: 12 }) {
      Row() {
        Text('个人设置').fontSize('20fp').fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).layoutWeight(1);
        Button('完成').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
          .enabled(!this.vm.saving).fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT)
          .onClick(() => this.onClose());
      }
      .width('100%');
      if (this.vm.message !== '') {
        Text(this.vm.message).fontSize('13fp').fontColor(COLOR_PRIMARY).width('100%');
      }
      Scroll() {
        Column({ space: 16 }) {
          Column({ space: 12 }) {
            Row({ space: 14 }) {
              if (this.avatarSource() !== '') {
                Image(this.avatarSource()).width(64).height(64).borderRadius(CIRCLE_RADIUS).objectFit(ImageFit.Cover);
              } else {
                Text('我').fontSize('22fp').width(64).height(64).textAlign(TextAlign.Center)
                  .fontColor(COLOR_PRIMARY).backgroundColor(COLOR_PRIMARY_SOFT).borderRadius(CIRCLE_RADIUS);
              }
              Column({ space: 6 }) {
                Button('上传头像').type(ButtonType.Normal).height(44).borderRadius(UI_RADIUS)
                  .enabled(!this.vm.saving && !this.vm.loading).fontColor(COLOR_PRIMARY)
                  .backgroundColor(COLOR_PRIMARY_SOFT).onClick(() => this.vm.chooseAvatar());
                Text('JPEG、PNG、WebP，最大 5 MB').fontSize('11fp').fontColor(COLOR_TEXT_TERTIARY);
              }
              .alignItems(HorizontalAlign.Start).layoutWeight(1);
            }
            .width('100%');
            Text('昵称').fontSize('14fp').fontWeight(FontWeight.Medium).fontColor(COLOR_TEXT_PRIMARY).width('100%');
            TextInput({ placeholder: '请输入昵称', text: this.vm.nickname }).maxLength(24)
              .height(48).fontSize('14fp').backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
              .enabled(!this.vm.loading && !this.vm.saving)
              .onChange((value: string) => { this.vm.nickname = value; this.vm.profileError = ''; this.vm.message = ''; });
            Text(this.vm.user === null ? '' : `邮箱：${this.vm.user.email || ''}`)
              .fontSize('12fp').fontColor(COLOR_TEXT_SECONDARY).width('100%');
            if (this.vm.profileError !== '') {
              Text(this.vm.profileError).fontSize('12fp').fontColor(COLOR_ERROR).width('100%');
            }
            Button(this.vm.saving ? '保存中…' : '保存个人资料').type(ButtonType.Normal).height(46).width('100%')
              .borderRadius(UI_RADIUS).fontColor(Color.White).backgroundColor(COLOR_PRIMARY)
              .enabled(!this.vm.loading && !this.vm.saving).onClick(async () => {
                if (await this.vm.saveProfile() && this.vm.user !== null) this.onUserChanged(this.vm.user);
              });
          }
          .width('100%').padding(16).backgroundColor(Color.White).borderRadius(UI_RADIUS);

          Column({ space: 12 }) {
            Text('修改密码').fontSize('16fp')
              .fontWeight(FontWeight.Bold).fontColor(COLOR_TEXT_PRIMARY).width('100%');
            Text('6–64 位，不能全部为空白').fontSize('12fp').fontColor(COLOR_TEXT_TERTIARY).width('100%');
            TextInput({ placeholder: '当前密码', text: this.vm.currentPassword }).type(InputType.Password).maxLength(64)
              .height(48).fontSize('14fp').backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
              .enabled(!this.vm.loading && !this.vm.saving)
              .onChange((value: string) => { this.vm.currentPassword = value; this.vm.passwordError = ''; this.vm.message = ''; });
            TextInput({ placeholder: '新密码', text: this.vm.newPassword }).type(InputType.Password).maxLength(64)
              .height(48).fontSize('14fp').backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
              .enabled(!this.vm.loading && !this.vm.saving)
              .onChange((value: string) => { this.vm.newPassword = value; this.vm.passwordError = ''; this.vm.message = ''; });
            TextInput({ placeholder: '再次输入新密码', text: this.vm.confirmPassword }).type(InputType.Password).maxLength(64)
              .height(48).fontSize('14fp').backgroundColor(COLOR_PAGE_BG).borderRadius(UI_RADIUS)
              .enabled(!this.vm.loading && !this.vm.saving)
              .onChange((value: string) => { this.vm.confirmPassword = value; this.vm.passwordError = ''; this.vm.message = ''; });
            if (this.vm.passwordError !== '') {
              Text(this.vm.passwordError).fontSize('12fp').fontColor(COLOR_ERROR).width('100%');
            }
            Button(this.vm.saving ? '保存中…' : '保存密码').type(ButtonType.Normal).height(46).width('100%')
              .borderRadius(UI_RADIUS).fontColor(Color.White).backgroundColor(COLOR_PRIMARY)
              .enabled(!this.vm.loading && !this.vm.saving).onClick(async () => {
                if (await this.vm.savePassword() && this.vm.user !== null) this.onUserChanged(this.vm.user);
              });
          }
          .width('100%').padding(16).backgroundColor(Color.White).borderRadius(UI_RADIUS);
          if (this.vm.loading) {
            LoadingProgress().width(28).height(28).color(COLOR_PRIMARY);
          }
        }
        .width('100%').padding({ bottom: 24 });
      }
      .layoutWeight(1).width('100%').scrollBar(BarState.Off);
    }
    .width('100%').height('100%').padding({ left: 16, right: 16, top: 16, bottom: 16 }).backgroundColor(COLOR_PAGE_BG);
  }

  private avatarSource(): string {
    return this.vm.avatarUri !== '' ? this.vm.avatarUri : (this.vm.user === null ? '' : this.vm.user.avatar);
  }
}
