$(function () {
    // initialize custom bootstrap file inputs
    bsCustomFileInput.init();

    // show form submission results in a modal instead of a new page
    $('[onsubmit-modal]').submit(function (ev) {
        ev.preventDefault();
        var form = ev.target;
        var modal = $(form.getAttribute('onsubmit-modal'));
        modal.show = function(title, body) {
            modal.find('#modalTitle').text(title);
            modal.find('#modalBody').text(body);
            modal.modal('show');
        }
        modal.show(
            'Please Wait',
            'Uploading files to s3 and sending job to queue...'
        );

        $.ajax({
            type: 'POST',
            url: form.action,
            data: new FormData(form),
            contentType: false,
            processData: false,
            success: function(data) {
                modal.show('Request Submitted', data);
            },
            error: function(jqXHR) {
                modal.show('Error', jqXHR.responseText);
            }
          });
    });
});
