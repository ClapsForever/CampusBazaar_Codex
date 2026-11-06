import { common } from '@kit.AbilityKit';
import { camera, cameraPicker as picker } from '@kit.CameraKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { PublishDraft } from '../model/Models';
import { productService } from '../service/ProductService';
import { isValidPrice, parsePrice } from '../common/Utils';
import { MAX_PRODUCT_PHOTOS } from '../common/Constants';
import { CAMPUS_OPTIONS, isPublishCategory } from '../common/MarketOptions';

@ObservedV2
export class PublishViewModel {
  @Trace title: string = '';
  @Trace description: string = '';
  @Trace priceText: string = '';
  @Trace category: string = '';
  @Trace campus: string = '';
  @Trace meetingPlace: string = '';
  @Trace condition: string = 'good';
  @Trace images: string[] = [];
  @Trace titleError: string = '';
  @Trace descriptionError: string = '';
  @Trace priceError: string = '';
  @Trace photoError: string = '';
  @Trace categoryError: string = '';
  @Trace campusError: string = '';
  @Trace formError: string = '';
  @Trace submitting: boolean = false;

  get canAddPhoto(): boolean {
    return this.images.length < MAX_PRODUCT_PHOTOS;
  }

  validate(): boolean {
    const titleLength: number = this.title.trim().length;
    this.titleError = titleLength === 0 ? '请输入商品名称' : (titleLength > 100 ? '商品名称最多 100 字' : '');
    this.descriptionError = this.description.trim() === '' ? '请输入商品描述' :
      (this.fullDescription().length > 3000 ? '商品描述和见面地点合计最多 3000 字' : '');
    this.priceError = isValidPrice(this.priceText) ? '' : '价格须大于 0 且不超过 100000 元，最多两位小数';
    this.categoryError = isPublishCategory(this.category) ? '' : '请选择商品类别';
    this.campusError = CAMPUS_OPTIONS.includes(this.campus) ? '' : '请选择所在校区';
    return this.titleError === '' && this.descriptionError === '' && this.priceError === '' &&
      this.categoryError === '' && this.campusError === '';
  }

  private fullDescription(): string {
    const description: string = this.description.trim();
    const meetingPlace: string = this.meetingPlace.trim();
    return meetingPlace === '' ? description : `${description}\n见面地点：${meetingPlace}`;
  }

  addImages(uris: string[]): void {
    if (!this.canAddPhoto) {
      this.photoError = `最多支持 ${MAX_PRODUCT_PHOTOS} 张照片`;
      return;
    }
    const remaining: number = MAX_PRODUCT_PHOTOS - this.images.length;
    const accepted: string[] = uris.filter((uri: string): boolean => uri !== '').slice(0, remaining);
    this.images = [...this.images, ...accepted];
    this.photoError = uris.length > remaining ? `最多支持 ${MAX_PRODUCT_PHOTOS} 张照片` : '';
  }

  removeImage(index: number): void {
    this.images = this.images.filter((_uri: string, itemIndex: number): boolean => itemIndex !== index);
    this.photoError = '';
  }

  async takePhoto(context: common.UIAbilityContext): Promise<boolean> {
    if (!this.canAddPhoto) {
      this.photoError = `最多支持 ${MAX_PRODUCT_PHOTOS} 张照片`;
      return false;
    }
    try {
      const profile: picker.PickerProfile = {
        cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK
      };
      const result: picker.PickerResult = await picker.pick(context, [picker.PickerMediaType.PHOTO], profile);
      if (result.resultUri) {
        this.addImages([result.resultUri]);
        return true;
      }
      return false;
    } catch (_error) {
      this.photoError = '拍摄已取消或暂时不可用，请改用相册选择';
      return false;
    }
  }

  async chooseFromAlbum(): Promise<boolean> {
    if (!this.canAddPhoto) {
      this.photoError = `最多支持 ${MAX_PRODUCT_PHOTOS} 张照片`;
      return false;
    }
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions();
      options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
      options.maxSelectNumber = MAX_PRODUCT_PHOTOS - this.images.length;
      const pickerView: photoAccessHelper.PhotoViewPicker = new photoAccessHelper.PhotoViewPicker();
      const result: photoAccessHelper.PhotoSelectResult = await pickerView.select(options);
      if (result.photoUris.length > 0) {
        this.addImages(result.photoUris);
        return true;
      }
      return false;
    } catch (_error) {
      this.photoError = '相册选择已取消或暂时不可用，请稍后重试';
      return false;
    }
  }

  async submit(): Promise<boolean> {
    if (this.submitting || !this.validate()) {
      return false;
    }
    this.submitting = true;
    this.formError = '';
    try {
      const draft: PublishDraft = {
        title: this.title.trim(),
        description: this.fullDescription(),
        price: parsePrice(this.priceText),
        images: [...this.images],
        category: this.category,
        campus: this.campus,
        condition: this.condition
      };
      await productService.publishProduct(draft);
      return true;
    } catch (error) {
      this.formError = (error as Error).message || '发布失败，请稍后重试';
      return false;
    } finally {
      this.submitting = false;
    }
  }
}
