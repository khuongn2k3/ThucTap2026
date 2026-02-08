<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Image;

class ImageController extends Controller
{
    public function upload(Request $request)
    {
        $request->validate([
            'image' => 'required|image',
            'type' => 'required|in:single,multi',
        ]);

        $path = $request->file('image')->store('uploads', 'public');

        $image = Image::create([
            'user_id' => auth('api')->id(), 
            'image_path' => $path,
            'type' => $request->type,
        ]);

        return response()->json([
            'message' => 'Upload thành công',
            'data' => $image
        ]);
    }
}
