<?php

protected $routeMiddleware = [
    'auth' => \App\Http\Middleware\Authenticate::class,
    'auth.basic' => \Illuminate\Auth\Middleware\AuthenticateWithBasicAuth::class,
    'auth.session' => \Illuminate\Session\Middleware\AuthenticateSession::class,

    'auth:api' => \Tymon\JWTAuth\Http\Middleware\Authenticate::class,

    'admin' => \App\Http\Middleware\AdminMiddleware::class,
];
