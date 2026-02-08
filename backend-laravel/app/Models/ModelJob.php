<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ModelJob extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'input_type',
        'input_path',
        'output_model',
        'vram_required',
        'vram_used',
        'status',
        'error_log',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
