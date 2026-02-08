<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConvertJob extends Model
{
    use HasFactory;

    protected $table = 'convert_jobs';

    protected $fillable = [
        'user_id',
        'input_file',
        'output_file',
        'status',
        'error',
    ];

    /* ---------------- RELATION ---------------- */

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
