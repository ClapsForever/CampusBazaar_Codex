import { common } from '@kit.AbilityKit';
import { camera, cameraPicker as picker } from '@kit.CameraKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { PublishDraft } from '../model/Models';
import { productService } from '../service/ProductService';
import { isValidPrice, parsePrice } from '../common/Utils';
import { MAX_PRODUCT_PHOTOS } from '../common/Constants';

@ObservedV2
export class PublishViewModel {
  @Trace title: string = '';
  @Trace description: string = '';
  @Trace priceText: string = '';
  @Trace images: string[] = [];
  @Trace titleError: string = '';
  @Trace descriptionError: string = '';
  @Trace priceError: string = '';
  @Trace photoError: string = '';
  @Trace submitting: boolean = false;

  get canAddPhoto(): boolean {
    return this.images.length < MAX_PRODUCT_PHOTOS;
  }

  validate(): boolean {
    this.titleError = this.title.trim() === '' ? '请输入商品名称' : '';
    this.descriptionError = this.description.trim() === '' ? '请输入商品描述' : '';
    this.priceError = isValidPrice(this.priceText) ? '' : '请输入大于 0 的合法价格';
    return this.titleError === '' && this.descriptionError === '' && this.priceError === '';
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
    if (!this.validate() || this.submitting) {
      return false;
    }
    this.submitting = true;
    try {
      const draft: PublishDraft = {
        title: this.title,
        description: this.description,
        price: parsePrice(this.priceText),
        images: [...this.images]
      };
      await productService.publishProduct(draft);
      return true;
    } catch (error) {
      this.priceError = (error as Error).message;
      return false;
    } finally {
      this.submitting = false;
    }
  }
}
