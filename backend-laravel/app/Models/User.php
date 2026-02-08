<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Tymon\JWTAuth\Contracts\JWTSubject;

use App\Models\Image;
use App\Models\ModelJob;
use App\Models\Payment;

class User extends Authenticatable implements JWTSubject
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'avatar',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];

    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute()
    {
        return $this->avatar
            ? asset('storage/' . $this->avatar)
            : null;
    }

    /* ======================
       JWT IMPLEMENTATION
       ====================== */

    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims()
    {
        return [];
    }

    /* ======================
       RELATIONSHIPS
       ====================== */

    public function images()
    {
        return $this->hasMany(Image::class);
    }

    public function modelJobs()
    {
        return $this->hasMany(ModelJob::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
