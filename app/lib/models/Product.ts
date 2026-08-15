import { Schema, model, models } from 'mongoose';

const productSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  badge: { type: String, required: true },
  color: { type: String, required: true },
  availability: [{ type: String, required: true }],
  inventory: { type: String, required: true },
  variants: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
  }],
  icon: { type: String, required: true },
  image: { type: String, required: true },
});

export default models.Product || model('Product', productSchema);
