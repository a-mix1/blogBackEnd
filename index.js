import { createClient } from '@supabase/supabase-js';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import mammoth from 'mammoth';
import env from 'dotenv';

env.config();


const app = express();
const storage = multer.memoryStorage(); // store file in memory (important for Mammoth)
const upload = multer({ storage });
const supabase = createClient(process.env.DATABASE_URL,process.env.DATABASE_KEY);

// middleware
app.use(cors());
app.use(express.json());


/*const blogs=[
    {title: "Test Blog",
    slug: "test-blog1",
    coverImage:"https://images.pexels.com/photos/36430583/pexels-photo-36430583.jpeg",
    excerpt: "Hello",
    content: "<p>Content</p>",
    status:'published'},
    {title: "Test Blog",
    slug: "test-blog2",
    coverImage:"https://images.pexels.com/photos/36430583/pexels-photo-36430583.jpeg",
    excerpt: "broo",
    content: "<p>Content</p>",
    status:'published'},
]*/



async function uploadCoverImagetoSupabase(file)
{
  const fileName = `${Date.now()}-${file.originalname}`;
  const {error } = await supabase.storage
                .from('images')
                .upload(fileName, file.buffer,{contentType: file.mimetype,upsert: true})
  if (error) {
   throw error
  } 

       const { data } = supabase.storage
    .from('images')
    .getPublicUrl(fileName, {
      transform: {
        width: 900,
        quality: 80,
        format: 'webp'
      }
    });

        return data.publicUrl;
}


app.get('/api/blogs', async(req, res) => {
  const { data, error } = await supabase.from("blogs").select('title,created_at,cover_Image,slug,excerpt')
  .eq('status','Published');
  if(!data||error)
  {
    res.status(404).json({error:error})
  }
  else
    res.json(data);
});

app.get(`/api/blogs/:slug`, async(req,res)=>{
    
   const { data, error } = await supabase.from("blogs")
   .select()
   .eq('slug',req.params.slug).single()

    if(!data || error)
       return res.status(404).json({error:"could not find blog"})
    res.json(data)
})



const uploadMiddleware = upload.fields([{ name: 'blogFile'}, { name: 'coverImage'}])


app.post('/api/blogs/admin', uploadMiddleware, async (req, res) => {
  try {
    const { title, status } = req.body;

    if (!req.files || !req.files['blogFile']) {
      return res.status(400).json({ error: "blogFile is required" });
    }

    const blogFile = req.files['blogFile'][0];
    const coverImage = req.files['coverImage']?.[0];

    const convertedBody = await mammoth.convertToHtml(
      {buffer: blogFile.buffer},
      {
        convertImage: mammoth.images.imgElement(async(image)=> {
          const imageBuffer=await image.read();
           const fileName=`doc-image-${Date.now()}.png`;

            const { error } = await supabase.storage
            .from('images')
            .upload(fileName,imageBuffer);

            if (error)throw error;

            const{data}= supabase.storage
            .from('images')
             .getPublicUrl(fileName, {
              transform: {
                width: 1200,
                quality: 80,
                format: 'webp'
              }
            });

              return {src:data.publicUrl};
        })
      })
    /*const convertedBody = await mammoth.convertToHtml(
      {buffer: blogFile.buffer});*/

    const htmlContent = convertedBody.value;
    
   
    // excerpt generation
    const plainText = htmlContent.replace(/<[^>]+>/g, '');
    const excerpt = plainText.substring(0, 120) + "...";
    const coverImageurl= coverImage?await uploadCoverImagetoSupabase(coverImage):null;

    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = today.getFullYear();

    today = mm + '/' + dd + '/' + yyyy;
    
    const blog = {
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      created_at:today,
      cover_image: coverImageurl ? coverImageurl: null,
      excerpt,
      content: htmlContent,
      status
    };

    const { data, error } = await supabase.from("blogs").insert([blog]);
            if (error) {
              return res.status(400).json(error);
            }
            res.status(200).json({"message":"uploaded succesfully"});
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});  
// start server
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});