import type { NextApiRequest, NextApiResponse } from "next";
import { parseForm } from "../../utils/parse-form";

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<{
    data: {
      url: string | string[];
    } | null;
    error: string | null;
  }>
) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      data: null,
      error: "Method Not Allowed",
    });
    return;
  }

  // Just after the "Method Not Allowed" code
  try {
    const { files } = await parseForm(req);

    const file = files.media;
    if(!file) {
      res.status(400).json({
        data: null,
        error: "No file uploaded",
      });
      return;
    }

    // for now, to distinguish between files that were uploaded in "new "veiligstallen and "old" veiligstallen
    // we add [local] to the path -> any file that has [local] in the path is a file that was uploaded in public/uploads etc.
    const makepathrelative = (filename: string) => {
      if (process.env.NODE_ENV === 'production') {
        // In production, files are stored in /home/uploads, serve them from /uploads
        return filename.replace('/home/uploads', '[local]/uploads');
      } else {
        // In development, files are stored in public/uploads
        return filename.replace(process.cwd()+'/public','[local]');
      }
    };
    // let url = Array.isArray(file) ? file.map((f) => makepathrelative(f.filepath)) : makepathrelative(file.filepath);
    const url = file.map((f) => makepathrelative(f.filepath));

    res.status(200).json({
      data: {
        url,
      },
      error: null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: "Internal Server Error \n\n"+JSON.stringify(e) });
    return;
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default handler;